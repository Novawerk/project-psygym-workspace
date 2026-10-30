package io.novawerk.psygym.data.voice

import android.content.Context
import io.elevenlabs.AgentOverrides
import io.elevenlabs.ConversationClient
import io.elevenlabs.ConversationConfig
import io.elevenlabs.ConversationSession
import io.elevenlabs.Language
import io.elevenlabs.Overrides
import io.elevenlabs.models.ConversationMode
import io.elevenlabs.models.DisconnectionDetails
import io.novawerk.psygym.domain.voice.MicPermission
import io.novawerk.psygym.domain.voice.VoiceCall
import io.novawerk.psygym.domain.voice.VoiceCallEnd
import io.novawerk.psygym.domain.voice.VoiceCallListener
import io.novawerk.psygym.domain.voice.VoiceCallSetup
import io.novawerk.psygym.domain.voice.VoiceInput
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Voice sessions on Android (ADR 0013). The microphone permission is the same one as hold to talk. */
class ElevenLabsVoiceCall(context: Context, private val mic: VoiceInput) : VoiceCall {
    private val app = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var session: ConversationSession? = null

    /** Bumped by every start and hang-up. A late callback from an older call does nothing. */
    private var call = 0

    override fun micPermission(): MicPermission = mic.micPermission()

    override suspend fun requestMic(): Boolean = mic.requestMic()

    override fun openSettings() = mic.openSettings()

    override fun start(setup: VoiceCallSetup, listener: VoiceCallListener) {
        hangUp()
        val mine = ++call
        // The SDK calls back from its own threads.
        fun deliver(block: VoiceCallListener.() -> Unit) {
            scope.launch { if (mine == call) listener.block() }
        }
        var clientLeft = false
        val config = ConversationConfig(
            conversationToken = setup.conversationToken,
            dynamicVariables = setup.dynamicVariables,
            customLlmExtraBody = setup.extraBody,
            overrides = Overrides(agent = AgentOverrides(language = Language.fromCode(setup.language))),
            onConnect = { deliver { onConnected() } },
            onModeChange = { mode -> deliver { onClientSpeaking(mode == ConversationMode.SPEAKING) } },
            onUserTranscriptEvent = { text, _ -> deliver { onCounselor(text) } },
            onAgentResponseEvent = { text, _ -> deliver { onClient(text) } },
            onAgentResponseCorrectionEvent = { text, _ -> deliver { onClientCorrected(text) } },
            onAgentToolResponse = { tool, _, _, _ -> if (tool == END_CALL) clientLeft = true },
            onDisconnect = { details ->
                val end = when {
                    // First: when the agent leaves, the SDK ends the session itself and says "user".
                    clientLeft -> VoiceCallEnd.ClientLeft
                    details is DisconnectionDetails.User -> VoiceCallEnd.HungUp
                    else -> VoiceCallEnd.Dropped
                }
                deliver { onEnded(end) }
            },
        )
        scope.launch {
            try {
                val started = ConversationClient.startSession(config, app)
                if (mine == call) session = started else started.endSession()
                if (mine == call) speakTestLines(started, mine, listener)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // No network, or the room refused the token.
                deliver { onEnded(VoiceCallEnd.Dropped) }
            }
        }
    }

    /** Debug builds on an emulator, which has no microphone: see [VoiceTestAudio]. */
    private suspend fun speakTestLines(session: ConversationSession, mine: Int, listener: VoiceCallListener) {
        for (line in VoiceTestAudio.callLines(app.filesDir)) {
            delay(TEST_LINE_GAP_MILLIS)
            if (mine != call) return
            session.sendUserMessage(line)
            listener.onCounselor(line)
        }
    }

    override fun setMuted(muted: Boolean) {
        val current = session ?: return
        scope.launch { current.setMicMuted(muted) }
    }

    override fun hangUp() {
        val current = session
        if (current == null) {
            call++ // a call still connecting is dropped when it arrives
            return
        }
        session = null
        scope.launch { current.endSession() }
    }

    private companion object {
        const val END_CALL = "end_call"
        const val TEST_LINE_GAP_MILLIS = 8_000L
    }
}
