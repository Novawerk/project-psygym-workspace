package io.novawerk.psygym.data.voice

import io.novawerk.psygym.domain.voice.MicPermission
import io.novawerk.psygym.domain.voice.VoiceInput
import io.novawerk.psygym.domain.voice.VoiceLang
import io.novawerk.psygym.domain.voice.VoiceListener
import io.novawerk.psygym.domain.voice.VoiceReadiness
import io.novawerk.psygym.domain.voice.VoiceText
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Apple's on-device Speech framework, implemented in Swift (`iosApp/SpeechBridge.swift`):
 * `SpeechAnalyzer` is Swift-only. Every callback arrives on the main thread.
 */
interface AppleSpeechBridge {
    /** [AVAILABLE_READY], [AVAILABLE_NEEDS_DOWNLOAD] or [AVAILABLE_UNSUPPORTED]. */
    fun availability(locale: String, done: (Int) -> Unit)

    /** Asks the system to download the language model. */
    fun install(locale: String, progress: (Double) -> Unit, done: (Boolean) -> Unit)

    /** [PERMISSION_GRANTED], [PERMISSION_NOT_ASKED] or [PERMISSION_DENIED]. */
    fun permission(): Int

    fun requestPermission(done: (Boolean) -> Unit)

    fun isExpensiveNetwork(): Boolean

    fun openSettings()

    /** [onText]: finalized text, then the part that may still change. [onLevel]: 0..1. */
    fun start(locale: String, onText: (String, String) -> Unit, onLevel: (Float) -> Unit, done: (Boolean) -> Unit)

    fun finish(done: (String) -> Unit)

    fun cancel()

    companion object {
        const val AVAILABLE_READY = 0
        const val AVAILABLE_NEEDS_DOWNLOAD = 1
        const val AVAILABLE_UNSUPPORTED = 2
        const val PERMISSION_GRANTED = 0
        const val PERMISSION_NOT_ASKED = 1
        const val PERMISSION_DENIED = 2
    }
}

/** Hold-to-talk on iOS. No model of ours: the system owns it, so nothing for us to delete. */
class AppleVoiceInput(private val bridge: AppleSpeechBridge) : VoiceInput {
    private val _readiness = MutableStateFlow<VoiceReadiness>(VoiceReadiness.Unknown)
    override val readiness: StateFlow<VoiceReadiness> = _readiness
    private val _level = MutableStateFlow(0f)
    override val level: StateFlow<Float> = _level
    private var installing = false

    override suspend fun refresh(lang: VoiceLang) {
        if (installing) return
        val a = suspendCancellableCoroutine { c -> bridge.availability(lang.tag) { c.resume(it) } }
        _readiness.value = when (a) {
            AppleSpeechBridge.AVAILABLE_READY -> VoiceReadiness.Ready
            AppleSpeechBridge.AVAILABLE_NEEDS_DOWNLOAD -> VoiceReadiness.NeedsDownload(null)
            else -> VoiceReadiness.Unsupported
        }
    }

    override fun download(lang: VoiceLang) {
        if (installing) return
        installing = true
        _readiness.value = VoiceReadiness.Downloading(null)
        bridge.install(
            lang.tag,
            progress = { _readiness.value = VoiceReadiness.Downloading(it.toFloat()) },
            done = { ok ->
                installing = false
                _readiness.value = if (ok) VoiceReadiness.Ready else VoiceReadiness.DownloadFailed
            },
        )
    }

    override fun isMetered(): Boolean = bridge.isExpensiveNetwork()

    override fun micPermission(): MicPermission = when (bridge.permission()) {
        AppleSpeechBridge.PERMISSION_GRANTED -> MicPermission.Granted
        AppleSpeechBridge.PERMISSION_NOT_ASKED -> MicPermission.NotAsked
        else -> MicPermission.Denied
    }

    override suspend fun requestMic(): Boolean = suspendCancellableCoroutine { c -> bridge.requestPermission { c.resume(it) } }

    override fun openSettings() = bridge.openSettings()

    override suspend fun warmUp(lang: VoiceLang) {}

    override suspend fun start(lang: VoiceLang, listener: VoiceListener): Boolean = suspendCancellableCoroutine { c ->
        bridge.start(
            lang.tag,
            onText = { stable, pending -> listener.onText(VoiceText.clean(stable), pending) },
            onLevel = { _level.value = it },
            done = { c.resume(it) },
        )
    }

    override suspend fun finish(): String {
        val text = suspendCancellableCoroutine { c -> bridge.finish { c.resume(it) } }
        _level.value = 0f
        return VoiceText.clean(text)
    }

    override fun cancel() {
        bridge.cancel()
        _level.value = 0f
    }

    override fun release() {}

    override fun modelBytes(): Long = 0

    override suspend fun deleteModel() {}
}
