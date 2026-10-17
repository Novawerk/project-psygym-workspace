// On-device recognition with Apple's Speech framework on the test wavs.
// usage: applebench <legacy|transcriber> <zh|en> <wav>...   → one JSON line per file
import AVFoundation
import Foundation
import Speech

let args = CommandLine.arguments
let mode = args[1], lang = args[2]
let locale = Locale(identifier: lang == "zh" ? "zh-CN" : "en-US")
let files = args.dropFirst(3).map { URL(fileURLWithPath: $0) }

func emit(_ d: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: d)
    print(String(data: data, encoding: .utf8)!)
    fflush(stdout)
}

func legacy() async {
    let status = await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) } }
    guard let rec = SFSpeechRecognizer(locale: locale) else { emit(["error": "no recognizer"]); return }
    emit(["auth": status.rawValue, "supportsOnDevice": rec.supportsOnDeviceRecognition, "available": rec.isAvailable])
    guard rec.supportsOnDeviceRecognition else { return }
    for f in files {
        // Stream the file in 100 ms buffers in real time, as the microphone would.
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.requiresOnDeviceRecognition = true
        req.shouldReportPartialResults = true
        let file = try! AVAudioFile(forReading: f)
        let fmt = file.processingFormat
        let start = Date()
        var first: Double? = nil
        var released = Date()
        let text: String = await withCheckedContinuation { c in
            var done = false
            _ = rec.recognitionTask(with: req) { r, e in
                if let r {
                    if first == nil, !r.bestTranscription.formattedString.isEmpty { first = Date().timeIntervalSince(start) }
                    if r.isFinal, !done { done = true; c.resume(returning: r.bestTranscription.formattedString) }
                } else if e != nil, !done { done = true; c.resume(returning: "ERR \(e!.localizedDescription)") }
            }
            Task {
                let n = AVAudioFrameCount(fmt.sampleRate / 10)
                while file.framePosition < file.length {
                    let b = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: n)!
                    try! file.read(into: b, frameCount: n)
                    req.append(b)
                    try? await Task.sleep(nanoseconds: 100_000_000)
                }
                released = Date()
                req.endAudio()
            }
        }
        emit(["file": f.lastPathComponent, "text": text, "first_s": first ?? -1, "final_after_release_s": Date().timeIntervalSince(released)])
    }
}

@available(macOS 26.0, *)
func transcriber() async throws {
    let supported = await SpeechTranscriber.supportedLocales.map { $0.identifier(.bcp47) }
    let installed = await SpeechTranscriber.installedLocales.map { $0.identifier(.bcp47) }
    guard let loc = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else { emit(["error": "unsupported", "supported": supported]); return }
    emit(["supported_has": loc.identifier(.bcp47), "installed": installed, "isAvailable": SpeechTranscriber.isAvailable])
    let probe = SpeechTranscriber(locale: loc, transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults], attributeOptions: [])
    if let req = try await AssetInventory.assetInstallationRequest(supporting: [probe]) {
        let t = Date(); try await req.downloadAndInstall(); emit(["downloaded_s": Date().timeIntervalSince(t)])
    }
    for f in files {
        let tr = SpeechTranscriber(locale: loc, transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults], attributeOptions: [])
        let an = SpeechAnalyzer(modules: [tr])
        let fmt = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [tr])!
        let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
        let start = Date()
        var first: Double? = nil
        var finalText = ""
        let reader = Task {
            for try await r in tr.results {
                let s = String(r.text.characters)
                if first == nil, !s.isEmpty { first = Date().timeIntervalSince(start) }
                if r.isFinal { finalText += s }
            }
        }
        try await an.start(inputSequence: stream)
        let file = try AVAudioFile(forReading: f)
        let conv = AVAudioConverter(from: file.processingFormat, to: fmt)!
        let n = AVAudioFrameCount(file.processingFormat.sampleRate / 10)
        while file.framePosition < file.length {
            let b = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: n)!
            try file.read(into: b, frameCount: n)
            let o = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(Double(n) * fmt.sampleRate / file.processingFormat.sampleRate) + 64)!
            var given = false
            conv.convert(to: o, error: nil) { _, st in
                if given { st.pointee = .noDataNow; return nil }
                given = true; st.pointee = .haveData; return b
            }
            cont.yield(AnalyzerInput(buffer: o))
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let released = Date()
        cont.finish()
        try await an.finalizeAndFinishThroughEndOfInput()
        try await reader.value
        emit(["file": f.lastPathComponent, "text": finalText, "first_s": first ?? -1, "final_after_release_s": Date().timeIntervalSince(released)])
    }
}

let sem = DispatchSemaphore(value: 0)
Task {
    if mode == "legacy" { await legacy() } else if #available(macOS 26.0, *) {
        do { try await transcriber() } catch { emit(["error": "\(error)"]) }
    }
    sem.signal()
}
sem.wait()
