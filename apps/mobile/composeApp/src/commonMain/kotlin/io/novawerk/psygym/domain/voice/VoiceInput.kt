package io.novawerk.psygym.domain.voice

import kotlinx.coroutines.flow.StateFlow

// Hold-to-talk (docs/product/voice-input.md, ADR 0010). Speech becomes text on the phone:
// audio never leaves the device, is never written to disk, and there is no cloud fallback.

/** The recognition language; follows the UI language. */
enum class VoiceLang(val tag: String) { Zh("zh-CN"), En("en-US") }

/** Whether hold-to-talk can run for a language right now. */
sealed interface VoiceReadiness {
    /** Not looked at yet. */
    data object Unknown : VoiceReadiness

    data object Ready : VoiceReadiness

    /** A model has to be downloaded first. [bytes] null: the system decides (iOS). */
    data class NeedsDownload(val bytes: Long?) : VoiceReadiness

    /** [progress] 0..1, or null when the system doesn't say. */
    data class Downloading(val progress: Float?) : VoiceReadiness

    data object DownloadFailed : VoiceReadiness

    /** No on-device recognition for this device, system or language. We never go to the cloud. */
    data object Unsupported : VoiceReadiness
}

enum class MicPermission { Granted, NotAsked, Denied }

/** What the recognizer heard so far: [stable] won't change, [pending] may. */
fun interface VoiceListener {
    fun onText(stable: String, pending: String)
}

/** One per app. Android: sherpa-onnx + X-ASR. iOS: Apple's on-device Speech framework. */
interface VoiceInput {
    val readiness: StateFlow<VoiceReadiness>

    /** Microphone level 0..1 while listening, for the wave. */
    val level: StateFlow<Float>

    /** Looks again: model on disk, system support, a download in progress. */
    suspend fun refresh(lang: VoiceLang)

    /** Starts (or resumes) the download in the background; progress shows in [readiness]. */
    fun download(lang: VoiceLang)

    /** True on mobile data or another metered network: suggest Wi-Fi before a download. */
    fun isMetered(): Boolean

    fun micPermission(): MicPermission

    /** Shows the system prompt (both mic and, on iOS, speech recognition). True when granted. */
    suspend fun requestMic(): Boolean

    fun openSettings()

    /** Loads the model into memory ahead of the first press. Safe to call more than once. */
    suspend fun warmUp(lang: VoiceLang)

    /** Starts listening. False when the microphone or recognizer couldn't start. */
    suspend fun start(lang: VoiceLang, listener: VoiceListener): Boolean

    /** Stops listening and returns everything heard, cleaned up ([VoiceText.clean]). */
    suspend fun finish(): String

    /** Stops listening and drops what was heard. */
    fun cancel()

    /** Frees the model's memory (leaving the session page). */
    fun release()

    /** Bytes the downloaded model takes on this phone; 0 when nothing is ours to delete. */
    fun modelBytes(): Long

    suspend fun deleteModel()
}

/** Tidies recognizer output for the input box. */
object VoiceText {
    private const val HAN = "[\\u3400-\\u4dbf\\u4e00-\\u9fff]"
    private const val PUNCT = "[，。？！、；：「」『』（）《》…—]"
    private val extraSpace = Regex("(?<=$PUNCT)\\s+|\\s+(?=$PUNCT)|(?<=$HAN)\\s+(?=$HAN)")

    /** No spaces around Chinese punctuation or between Chinese characters; the rest kept; trimmed. */
    fun clean(text: String): String = text.replace(extraSpace, "").replace(Regex("\\s{2,}"), " ").trim()

    /** Appends heard text to what's already typed, with a space only between two Latin words. */
    fun append(typed: String, heard: String): String {
        if (heard.isEmpty()) return typed
        if (typed.isBlank()) return heard
        val needsSpace = typed.last().isLetterOrDigit() && typed.last().code < 0x3000 &&
            heard.first().isLetterOrDigit() && heard.first().code < 0x3000
        return typed + (if (needsSpace) " " else "") + heard
    }
}
