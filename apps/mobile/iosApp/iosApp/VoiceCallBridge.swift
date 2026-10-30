import AVFoundation
import Combine
import ComposeApp
import ElevenLabs
import UIKit

/// Voice sessions on iOS (ADR 0013): the ElevenLabs Swift SDK. Unlike hold to talk (SpeechBridge),
/// the audio leaves the phone. All callbacks run on the main thread.
final class VoiceCallBridge: NSObject, AppleVoiceCallBridge {
    // Both touched only on the main actor.
    @MainActor private var conversation: Conversation?
    @MainActor private var watch: AnyCancellable?

    /// Bumped by every start and hang-up. A late callback from an older call does nothing.
    @MainActor private var call = 0

    func micStatus() -> Int32 {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return Self.granted
            case .denied: return Self.denied
            default: return Self.notAsked
            }
        }
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted: return Self.granted
        case .denied: return Self.denied
        default: return Self.notAsked
        }
    }

    func askMic(done: @escaping (KotlinBoolean) -> Void) {
        let finish = { (ok: Bool) in DispatchQueue.main.async { done(KotlinBoolean(bool: ok)) } }
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission(completionHandler: finish)
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission(finish)
        }
    }

    func showSettings() {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        }
    }

    func start(
        token: String,
        dynamicVariables: [String: String],
        extraBody: [String: String],
        language: String,
        onConnected: @escaping () -> Void,
        onClientSpeaking: @escaping (KotlinBoolean) -> Void,
        onCounselor: @escaping (String) -> Void,
        onClient: @escaping (String) -> Void,
        onClientCorrected: @escaping (String, String) -> Void,
        onEnded: @escaping (KotlinInt) -> Void
    ) {
        // The SDK's callbacks are @Sendable; Kotlin's lambdas aren't marked so, but we only ever
        // run them on the main thread.
        let handlers = Handlers(
            connected: onConnected, speaking: onClientSpeaking, counselor: onCounselor,
            client: onClient, corrected: onClientCorrected, ended: onEnded
        )
        Task { @MainActor in
            self.endCurrent()
            self.call += 1
            let mine = self.call
            let onMain: @Sendable (@escaping @MainActor (Handlers) -> Void) -> Void = { [weak self] body in
                Task { @MainActor in if self?.call == mine { body(handlers) } }
            }
            let clientLeft = Flag()
            let config = ConversationConfig(
                agentOverrides: AgentOverrides(language: Language(rawValue: language)),
                customLlmExtraBody: extraBody,
                dynamicVariables: dynamicVariables,
                onAgentResponse: { text, _ in onMain { $0.client(text) } },
                onAgentResponseCorrection: { original, corrected, _ in onMain { $0.corrected(original, corrected) } },
                onUserTranscript: { text, _ in onMain { $0.counselor(text) } },
                onAgentToolResponse: { event in if event.toolName == "end_call" { clientLeft.value = true } }
            )
            do {
                // These two go here: this call overwrites the ones in the config, with nil by default.
                let started = try await ElevenLabs.startConversation(
                    conversationToken: token,
                    config: config,
                    onAgentReady: { onMain { $0.connected() } },
                    onDisconnect: { reason in
                        let end: Int32
                        if clientLeft.value {
                            end = AppleVoiceCallBridgeCompanion.shared.END_CLIENT_LEFT
                        } else if case .user = reason {
                            end = AppleVoiceCallBridgeCompanion.shared.END_HUNG_UP
                        } else {
                            end = AppleVoiceCallBridgeCompanion.shared.END_DROPPED
                        }
                        onMain { $0.ended(KotlinInt(int: end)) }
                    }
                )
                guard self.call == mine else {
                    await started.endConversation()
                    return
                }
                self.conversation = started
                self.watch = started.$agentState
                    .map { $0 == .speaking }
                    .removeDuplicates()
                    .sink { speaking in onMain { $0.speaking(KotlinBoolean(bool: speaking)) } }
            } catch {
                onMain { $0.ended(KotlinInt(int: AppleVoiceCallBridgeCompanion.shared.END_DROPPED)) }
            }
        }
    }

    func setMuted(muted: Bool) {
        Task { @MainActor in try? await self.conversation?.setMuted(muted) }
    }

    func hangUp() {
        Task { @MainActor in self.endCurrent() }
    }

    @MainActor private func endCurrent() {
        guard let current = conversation else {
            call += 1 // a call still connecting is dropped when it arrives
            return
        }
        conversation = nil
        watch = nil
        Task { await current.endConversation() }
    }

    private static let granted = AppleSpeechBridgeCompanion.shared.PERMISSION_GRANTED
    private static let notAsked = AppleSpeechBridgeCompanion.shared.PERMISSION_NOT_ASKED
    private static let denied = AppleSpeechBridgeCompanion.shared.PERMISSION_DENIED
}

/// Kotlin's callbacks, carried across the SDK's @Sendable closures; only called on the main actor.
private struct Handlers: @unchecked Sendable {
    let connected: () -> Void
    let speaking: (KotlinBoolean) -> Void
    let counselor: (String) -> Void
    let client: (String) -> Void
    let corrected: (String, String) -> Void
    let ended: (KotlinInt) -> Void
}

/// Set by the SDK when the client hangs up in character, read when the call ends.
private final class Flag: @unchecked Sendable {
    var value = false
}
