import AVFoundation
import ComposeApp
import Network
import Speech
import UIKit

/// Hold to talk on iOS (ADR 0010): Apple's speech recognition, on the device only.
/// - iOS 26+ with SpeechTranscriber: SpeechAnalyzer, fast and volatile results.
/// - Otherwise: SFSpeechRecognizer, and only where `supportsOnDeviceRecognition` is true.
///   Without it, a request may go to Apple's servers, so we say "unsupported" instead.
/// Audio stays in memory; nothing is written to disk. All callbacks run on the main thread.
final class SpeechBridge: NSObject, AppleSpeechBridge {
    private let engine = AVAudioEngine()
    private let pathMonitor = NWPathMonitor()
    private var expensive = false

    // SFSpeechRecognizer path.
    private var legacyRequest: SFSpeechAudioBufferRecognitionRequest?
    private var legacyTask: SFSpeechRecognitionTask?
    private var legacyText = ""
    private var legacyFinal: ((String) -> Void)?

    // SpeechAnalyzer path (typed as Any so the class still loads before iOS 26).
    private var modern: Any?

    override init() {
        super.init()
        pathMonitor.pathUpdateHandler = { [weak self] path in self?.expensive = path.isExpensive }
        pathMonitor.start(queue: DispatchQueue(label: "voice-path"))
    }

    // MARK: Availability

    func availability(locale: String, done: @escaping (KotlinInt) -> Void) {
        let loc = Locale(identifier: locale)
        if #available(iOS 26.0, *), SpeechTranscriber.isAvailable {
            Task { @MainActor in done(KotlinInt(int: Int32(await ModernSpeech.availability(loc)))) }
            return
        }
        done(KotlinInt(int: Int32(Self.legacySupported(loc) ? Self.ready : Self.unsupported)))
    }

    func install(locale: String, progress: @escaping (KotlinDouble) -> Void, done: @escaping (KotlinBoolean) -> Void) {
        guard #available(iOS 26.0, *), SpeechTranscriber.isAvailable else { done(KotlinBoolean(bool: false)); return }
        Task { @MainActor in
            let ok = await ModernSpeech.install(Locale(identifier: locale)) { p in
                DispatchQueue.main.async { progress(KotlinDouble(double: p)) }
            }
            done(KotlinBoolean(bool: ok))
        }
    }

    private static func legacySupported(_ loc: Locale) -> Bool {
        guard let r = SFSpeechRecognizer(locale: loc) else { return false }
        return r.supportsOnDeviceRecognition
    }

    // MARK: Permission

    /// The microphone, and on the old path also speech recognition.
    func permission() -> Int32 {
        let mic = AVAudioSession.sharedInstance().recordPermission
        if mic == .denied { return Self.denied }
        var speech = SFSpeechRecognizer.authorizationStatus()
        if #available(iOS 26.0, *), SpeechTranscriber.isAvailable { speech = .authorized }
        if speech == .denied || speech == .restricted { return Self.denied }
        return mic == .granted && speech == .authorized ? Self.granted : Self.notAsked
    }

    func requestPermission(done: @escaping (KotlinBoolean) -> Void) {
        AVAudioSession.sharedInstance().requestRecordPermission { micOK in
            let finish = { (ok: Bool) in DispatchQueue.main.async { done(KotlinBoolean(bool: ok)) } }
            guard micOK else { finish(false); return }
            if #available(iOS 26.0, *), SpeechTranscriber.isAvailable { finish(true); return }
            SFSpeechRecognizer.requestAuthorization { finish($0 == .authorized) }
        }
    }

    func isExpensiveNetwork() -> Bool { expensive }

    func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }

    // MARK: Listening

    func start(locale: String, onText: @escaping (String, String) -> Void, onLevel: @escaping (KotlinFloat) -> Void, done: @escaping (KotlinBoolean) -> Void) {
        let loc = Locale(identifier: locale)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            done(KotlinBoolean(bool: false)); return
        }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        let level = { (buffer: AVAudioPCMBuffer) in
            let v = Self.rms(buffer)
            DispatchQueue.main.async { onLevel(KotlinFloat(float: min(1, v * 8))) }
        }
        let text = { (s: String, p: String) in DispatchQueue.main.async { onText(s, p) } }

        if #available(iOS 26.0, *), SpeechTranscriber.isAvailable {
            Task { @MainActor in
                let m = ModernSpeech()
                guard await m.begin(locale: loc, inputFormat: format, onText: text) else {
                    self.stopAudio(); done(KotlinBoolean(bool: false)); return
                }
                self.modern = m
                input.installTap(onBus: 0, bufferSize: 1600, format: format) { buffer, _ in
                    level(buffer)
                    m.feed(buffer)
                }
                done(KotlinBoolean(bool: self.startEngine()))
            }
            return
        }

        guard let recognizer = SFSpeechRecognizer(locale: loc), recognizer.supportsOnDeviceRecognition else {
            stopAudio(); done(KotlinBoolean(bool: false)); return
        }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true
        legacyRequest = request
        legacyText = ""
        legacyTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let result {
                    self.legacyText = result.bestTranscription.formattedString
                    // The old recognizer can revise anything until the end: all of it is pending.
                    onText("", self.legacyText)
                    if result.isFinal { self.endLegacy() }
                } else if error != nil {
                    self.endLegacy()
                }
            }
        }
        input.installTap(onBus: 0, bufferSize: 1600, format: format) { buffer, _ in
            level(buffer)
            request.append(buffer)
        }
        done(KotlinBoolean(bool: startEngine()))
    }

    func finish(done: @escaping (String) -> Void) {
        stopAudio()
        if #available(iOS 26.0, *), let m = modern as? ModernSpeech {
            modern = nil
            Task { @MainActor in done(await m.end()) }
            return
        }
        guard let request = legacyRequest else { done(""); return }
        legacyFinal = done
        request.endAudio()
        // The final result normally arrives within a second; don't wait forever.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.endLegacy() }
    }

    func cancel() {
        stopAudio()
        if #available(iOS 26.0, *), let m = modern as? ModernSpeech {
            modern = nil
            Task { await m.cancel() }
        }
        legacyTask?.cancel()
        legacyFinal = nil
        endLegacy()
    }

    private func endLegacy() {
        let done = legacyFinal
        legacyFinal = nil
        legacyTask = nil
        legacyRequest = nil
        done?(legacyText)
    }

    private func startEngine() -> Bool {
        engine.prepare()
        do { try engine.start(); return true } catch { stopAudio(); return false }
    }

    private func stopAudio() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private static func rms(_ b: AVAudioPCMBuffer) -> Float {
        guard let ch = b.floatChannelData?[0], b.frameLength > 0 else { return 0 }
        var e: Float = 0
        for i in 0..<Int(b.frameLength) { e += ch[i] * ch[i] }
        return (e / Float(b.frameLength)).squareRoot()
    }

    private static let ready = Int(AppleSpeechBridgeCompanion.shared.AVAILABLE_READY)
    private static let unsupported = Int(AppleSpeechBridgeCompanion.shared.AVAILABLE_UNSUPPORTED)
    private static let granted = AppleSpeechBridgeCompanion.shared.PERMISSION_GRANTED
    private static let notAsked = AppleSpeechBridgeCompanion.shared.PERMISSION_NOT_ASKED
    private static let denied = AppleSpeechBridgeCompanion.shared.PERMISSION_DENIED
}

/// iOS 26: SpeechAnalyzer + SpeechTranscriber. `fastResults` matters: without it the first
/// words show up only after about four seconds (voice-input.md §2).
@available(iOS 26.0, *)
private final class ModernSpeech {
    private var analyzer: SpeechAnalyzer?
    private var input: AsyncStream<AnalyzerInput>.Continuation?
    private var reader: Task<Void, Never>?
    private var converter: AVAudioConverter?
    private var format: AVAudioFormat?
    private var finalized = ""
    private var volatile = ""

    private static func transcriber(_ locale: Locale) -> SpeechTranscriber {
        SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults], attributeOptions: [])
    }

    static func availability(_ loc: Locale) async -> Int {
        guard let l = await SpeechTranscriber.supportedLocale(equivalentTo: loc) else { return 2 }
        switch await AssetInventory.status(forModules: [transcriber(l)]) {
        case .installed: return 0
        case .unsupported: return 2
        default: return 1
        }
    }

    static func install(_ loc: Locale, progress: @escaping (Double) -> Void) async -> Bool {
        guard let l = await SpeechTranscriber.supportedLocale(equivalentTo: loc) else { return false }
        do {
            if let req = try await AssetInventory.assetInstallationRequest(supporting: [transcriber(l)]) {
                let watch = Task {
                    while !Task.isCancelled {
                        progress(req.progress.fractionCompleted)
                        try? await Task.sleep(nanoseconds: 300_000_000)
                    }
                }
                defer { watch.cancel() }
                try await req.downloadAndInstall()
            }
            return true
        } catch {
            return false
        }
    }

    func begin(locale: Locale, inputFormat: AVAudioFormat, onText: @escaping (String, String) -> Void) async -> Bool {
        guard let l = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else { return false }
        let t = Self.transcriber(l)
        guard let best = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [t]),
              let conv = AVAudioConverter(from: inputFormat, to: best) else { return false }
        format = best
        converter = conv
        let a = SpeechAnalyzer(modules: [t])
        let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
        input = cont
        reader = Task { [weak self] in
            do {
                for try await r in t.results {
                    guard let self else { return }
                    let s = String(r.text.characters)
                    if r.isFinal { self.finalized += s; self.volatile = "" } else { self.volatile = s }
                    onText(self.finalized, self.volatile)
                }
            } catch {}
        }
        do {
            try await a.start(inputSequence: stream)
        } catch {
            return false
        }
        analyzer = a
        return true
    }

    /// Called on the audio thread.
    func feed(_ buffer: AVAudioPCMBuffer) {
        guard let conv = converter, let format, let input else { return }
        let ratio = format.sampleRate / buffer.format.sampleRate
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64) else { return }
        var given = false
        conv.convert(to: out, error: nil) { _, status in
            if given { status.pointee = .noDataNow; return nil }
            given = true
            status.pointee = .haveData
            return buffer
        }
        input.yield(AnalyzerInput(buffer: out))
    }

    func end() async -> String {
        input?.finish()
        try? await analyzer?.finalizeAndFinishThroughEndOfInput()
        await reader?.value
        return finalized + volatile
    }

    func cancel() async {
        input?.finish()
        await analyzer?.cancelAndFinishNow()
        reader?.cancel()
    }
}
