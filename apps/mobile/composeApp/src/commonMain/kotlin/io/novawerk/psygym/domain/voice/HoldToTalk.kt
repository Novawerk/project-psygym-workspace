package io.novawerk.psygym.domain.voice

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * One press of "hold to talk" (voice-input.md §4): press, speak, slide up to cancel, release.
 * The UI draws [phase] and reacts to [events]; the text goes to the input box, never sent.
 */
class HoldToTalk(
    private val voice: VoiceInput,
    private val scope: CoroutineScope,
    private val maxSeconds: Int = MAX_SECONDS,
) {
    sealed interface Phase {
        data object Idle : Phase

        /** Pressed; the microphone and model are starting. */
        data object Starting : Phase

        data class Listening(val stable: String, val pending: String, val seconds: Int, val cancelling: Boolean) : Phase

        /** Released; the last words are being recognised. [text]: what was shown so far. */
        data class Finishing(val text: String) : Phase
    }

    sealed interface Event {
        data class Heard(val text: String) : Event
        data object NothingHeard : Event
        data object MicDenied : Event
        /** The microphone or recognizer failed to start. */
        data object Failed : Event
    }

    private val _phase = MutableStateFlow<Phase>(Phase.Idle)
    val phase: StateFlow<Phase> = _phase.asStateFlow()

    private val _events = MutableSharedFlow<Event>(extraBufferCapacity = 4, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val events: SharedFlow<Event> = _events

    private var startJob: Job? = null
    private var timer: Job? = null
    private var released = false
    private var cancelZone = false

    fun press(lang: VoiceLang) {
        if (_phase.value != Phase.Idle) return
        released = false
        cancelZone = false
        when (voice.micPermission()) {
            MicPermission.Denied -> { _events.tryEmit(Event.MicDenied); return }
            // First time: the system prompt. This press doesn't record; the next one will.
            MicPermission.NotAsked -> {
                scope.launch { if (!voice.requestMic()) _events.tryEmit(Event.MicDenied) }
                return
            }
            MicPermission.Granted -> Unit
        }
        _phase.value = Phase.Starting
        startJob = scope.launch {
            // Called on the recognizer's thread: an atomic update, so a late result can never
            // turn Idle back into Listening.
            val ok = voice.start(lang) { stable, pending ->
                _phase.update { if (it is Phase.Listening) it.copy(stable = stable, pending = pending) else it }
            }
            if (!ok) {
                _phase.value = Phase.Idle
                _events.tryEmit(Event.Failed)
                return@launch
            }
            _phase.update { if (it == Phase.Starting) Phase.Listening("", "", 0, cancelZone) else it }
            if (_phase.value !is Phase.Listening) return@launch
            if (released) finishNow() else startTimer()
        }
    }

    /** The finger moved into (or out of) the cancel zone above the button. */
    fun cancelZone(inside: Boolean) {
        cancelZone = inside
        _phase.update { if (it is Phase.Listening && it.cancelling != inside) it.copy(cancelling = inside) else it }
    }

    fun release() {
        if (released) return
        released = true
        // Still starting: finish as soon as it has started (the start job checks [released]).
        if (_phase.value is Phase.Listening) finishNow()
    }

    private fun startTimer() {
        timer = scope.launch {
            var s = 0
            while (s < maxSeconds) {
                delay(1_000)
                s++
                if (_phase.value !is Phase.Listening) return@launch
                _phase.update { if (it is Phase.Listening) it.copy(seconds = s) else it }
            }
            // Time's up: same as letting go.
            release()
        }
    }

    private fun finishNow() {
        timer?.cancel()
        if (cancelZone) {
            voice.cancel()
            _phase.value = Phase.Idle
            return
        }
        val shown = (_phase.value as? Phase.Listening)?.let { it.stable + it.pending }.orEmpty()
        _phase.value = Phase.Finishing(shown)
        scope.launch {
            val text = try {
                voice.finish()
            } catch (e: Exception) {
                ""
            }
            _phase.value = Phase.Idle
            _events.tryEmit(if (text.isBlank()) Event.NothingHeard else Event.Heard(text))
        }
    }

    /** Leaving the page mid-press: drop everything. */
    fun abandon() {
        startJob?.cancel()
        timer?.cancel()
        if (_phase.value != Phase.Idle) voice.cancel()
        _phase.value = Phase.Idle
    }

    companion object {
        /** One press records at most this long (Apple's old recognizer stops at a minute). */
        const val MAX_SECONDS = 60

        /** From here on the bubble counts down. */
        const val WARN_FROM_SECONDS = 50
    }
}
