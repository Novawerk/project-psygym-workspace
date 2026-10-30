package io.novawerk.psygym.data.voice

import io.novawerk.psygym.domain.voice.MicPermission
import io.novawerk.psygym.domain.voice.VoiceCall
import io.novawerk.psygym.domain.voice.VoiceCallEnd
import io.novawerk.psygym.domain.voice.VoiceCallListener
import io.novawerk.psygym.domain.voice.VoiceCallSetup
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * The ElevenLabs Swift SDK, in Swift (`iosApp/VoiceCallBridge.swift`): the SDK has no Objective-C
 * interface for Kotlin to call. Every callback arrives on the main thread.
 */
interface AppleVoiceCallBridge {
    /** [AppleSpeechBridge.PERMISSION_GRANTED], `_NOT_ASKED` or `_DENIED`, for the microphone alone. */
    fun micStatus(): Int

    fun askMic(done: (Boolean) -> Unit)

    fun showSettings()

    /** [onEnded]: [END_HUNG_UP], [END_CLIENT_LEFT] or [END_DROPPED]. */
    fun start(
        token: String,
        dynamicVariables: Map<String, String>,
        extraBody: Map<String, String>,
        language: String,
        onConnected: () -> Unit,
        onClientSpeaking: (Boolean) -> Unit,
        onCounselor: (String) -> Unit,
        onClient: (String) -> Unit,
        onClientCorrected: (String, String) -> Unit,
        onEnded: (Int) -> Unit,
    )

    fun setMuted(muted: Boolean)

    fun hangUp()

    companion object {
        const val END_HUNG_UP = 0
        const val END_CLIENT_LEFT = 1
        const val END_DROPPED = 2
    }
}

/** Voice sessions on iOS (ADR 0013). */
class AppleVoiceCall(private val bridge: AppleVoiceCallBridge) : VoiceCall {
    override fun micPermission(): MicPermission = when (bridge.micStatus()) {
        AppleSpeechBridge.PERMISSION_GRANTED -> MicPermission.Granted
        AppleSpeechBridge.PERMISSION_DENIED -> MicPermission.Denied
        else -> MicPermission.NotAsked
    }

    override suspend fun requestMic(): Boolean = suspendCancellableCoroutine { cont ->
        bridge.askMic { granted -> if (cont.isActive) cont.resume(granted) }
    }

    override fun openSettings() = bridge.showSettings()

    override fun start(setup: VoiceCallSetup, listener: VoiceCallListener) {
        bridge.start(
            token = setup.conversationToken,
            dynamicVariables = setup.dynamicVariables,
            extraBody = setup.extraBody,
            language = setup.language,
            onConnected = listener::onConnected,
            onClientSpeaking = listener::onClientSpeaking,
            onCounselor = listener::onCounselor,
            onClient = listener::onClient,
            onClientCorrected = listener::onClientCorrected,
            onEnded = { end ->
                listener.onEnded(
                    when (end) {
                        AppleVoiceCallBridge.END_HUNG_UP -> VoiceCallEnd.HungUp
                        AppleVoiceCallBridge.END_CLIENT_LEFT -> VoiceCallEnd.ClientLeft
                        else -> VoiceCallEnd.Dropped
                    },
                )
            },
        )
    }

    override fun setMuted(muted: Boolean) = bridge.setMuted(muted)

    override fun hangUp() = bridge.hangUp()
}
