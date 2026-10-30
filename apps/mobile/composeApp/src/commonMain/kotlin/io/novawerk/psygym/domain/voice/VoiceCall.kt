package io.novawerk.psygym.domain.voice

import io.novawerk.psygym.domain.model.ContractLimits
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role

// Voice sessions (docs/decisions/0013-voice-elevenlabs.md). Unlike hold to talk, the audio leaves
// the phone: it goes to ElevenLabs, so a voice session needs its own consent first.

/** How a call ended. [ClientLeft] is the voice `session_end`: the client hung up in character. */
enum class VoiceCallEnd { HungUp, ClientLeft, Dropped }

/** What `POST /voice/session` gave us, plus the language ElevenLabs should listen and speak in. */
data class VoiceCallSetup(
    val conversationToken: String,
    val dynamicVariables: Map<String, String>,
    val extraBody: Map<String, String>,
    val language: String,
)

/** Everything here arrives on the main thread. */
interface VoiceCallListener {
    fun onConnected()

    /** True while the client's voice is playing. */
    fun onClientSpeaking(speaking: Boolean)

    /** ElevenLabs finished hearing a turn of the trainee's. */
    fun onCounselor(text: String)

    fun onClient(text: String)

    /** The trainee cut the client off: of the piece [original], only [said] was really spoken. */
    fun onClientCorrected(original: String, said: String)

    fun onEnded(end: VoiceCallEnd)
}

/** One per app. Android: `io.elevenlabs:elevenlabs-android`. iOS: the ElevenLabs Swift SDK. */
interface VoiceCall {
    fun micPermission(): MicPermission

    /** Shows the system prompt for the microphone only. True when granted. */
    suspend fun requestMic(): Boolean

    fun openSettings()

    fun start(setup: VoiceCallSetup, listener: VoiceCallListener)

    fun setMuted(muted: Boolean)

    /** Safe to call when no call is running. */
    fun hangUp()
}

/** The transcript of a call, in the shape `/supervision` takes. Never on screen during the call. */
object VoiceTranscript {
    /** What ElevenLabs sends as the trainee's turn when they stay quiet. Not something they said. */
    private val SILENT = Regex("^[.。…·\\s]+$")
    private val HAN = Regex("[\\u3400-\\u9fff]")

    fun add(messages: List<Message>, role: Role, heard: String): List<Message> {
        val text = heard.trim()
        if (text.isEmpty() || SILENT.matches(text)) return messages
        val last = messages.lastOrNull()
        // Two turns in a row from one side (a pause mid-thought): one message, as on the server.
        val merged = if (last?.role == role) messages.dropLast(1) + last.copy(text = join(last.text, text)) else messages + Message(role, text.clip())
        return merged.takeLast(ContractLimits.MAX_MESSAGES)
    }

    /**
     * The client was cut off. ElevenLabs sends a long reply in pieces, which [add] joins, and the
     * correction is about the last piece only: everything before it was said in full.
     */
    fun correct(messages: List<Message>, original: String, said: String): List<Message> {
        val at = messages.indexOfLast { it.role == Role.Client }
        if (at < 0) return messages
        val whole = messages[at].text
        val cut = whole.lastIndexOf(original.trim())
        if (original.isBlank() || cut < 0) return messages
        val text = (whole.substring(0, cut) + said.trim()).trim()
        return if (text.isEmpty()) messages.filterIndexed { i, _ -> i != at }
        else messages.mapIndexed { i, m -> if (i == at) m.copy(text = text) else m }
    }

    private fun join(a: String, b: String): String =
        (if (HAN.containsMatchIn(a.takeLast(1)) || HAN.containsMatchIn(b.take(1))) a + b else "$a $b").clip()

    private fun String.clip() = take(ContractLimits.MAX_MESSAGE_CHARS)
}
