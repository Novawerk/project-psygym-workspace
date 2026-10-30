package io.novawerk.psygym.ui.pages.voice

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.data.api.toError
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.ContractLimits
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.practice.LiveNotes
import io.novawerk.psygym.domain.practice.PracticeSession
import io.novawerk.psygym.domain.voice.VoiceCall
import io.novawerk.psygym.domain.voice.VoiceCaption
import io.novawerk.psygym.domain.voice.VoiceCallEnd
import io.novawerk.psygym.domain.voice.VoiceCallListener
import io.novawerk.psygym.domain.voice.VoiceCallSetup
import io.novawerk.psygym.domain.voice.VoiceTranscript
import io.novawerk.psygym.ui.pages.practice.EndKind
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The design's V2 and V3, then over. Only speaking and listening: the SDK has no "thinking". */
enum class VoicePhase { Connecting, Listening, Speaking, Over }

/** How long to wait for the call to connect (V2). */
private const val CONNECT_TIMEOUT_MILLIS = 15_000L

private const val NEAR_LIMIT = 70
private const val CAPTION_TICK_MILLIS = 100L

/** V2–V5 · One call, its transcript, and the way on to the report or to typing. */
class VoiceViewModel(
    private val api: PsygymApi,
    private val session: PracticeSession,
    private val call: VoiceCall,
) : ViewModel(), VoiceCallListener {

    val case = session.case

    var phase by mutableStateOf(VoicePhase.Connecting)
        private set
    var muted by mutableStateOf(false)
        private set
    var messages by mutableStateOf<List<Message>>(emptyList())
        private set

    /** Characters shown of the reply being spoken: the text comes well ahead of the voice. */
    private var shownChars by mutableStateOf(Int.MAX_VALUE)
    private val caption = VoiceCaption()
    private var captions: Job? = null

    /** What the screen shows; [messages] stays whole for the report. */
    val visibleMessages: List<Message> get() = VoiceTranscript.visible(messages, shownChars)

    /** `/voice/session` failed: nothing was connected. */
    var error by mutableStateOf<ApiError?>(null)
        private set

    /** How the call ended; null while it runs. */
    var ended by mutableStateOf<VoiceCallEnd?>(null)
        private set

    /** The call ended because the user left: the app went to the background, or "Need help?". */
    var left by mutableStateOf(false)
        private set

    /** The 80-message limit ended the call. */
    var atLimit by mutableStateOf(false)
        private set

    /** Mid-session supervisor notes, as in a typed session. Live as long as this screen. */
    val live = LiveNotes(api, viewModelScope)

    private var started = false
    private var timeout: Job? = null

    val turns: Int get() = messages.count { it.role == Role.Counselor }

    val nearLimit: Boolean get() = messages.size >= NEAR_LIMIT

    val clientEnded: Boolean get() = ended == VoiceCallEnd.ClientLeft

    /** There's something to report on. */
    val canReport: Boolean get() = messages.any { it.role == Role.Client }

    /** Which end-of-session sheet to show, as in a typed session. */
    val endKind: EndKind
        get() = when {
            clientEnded -> EndKind.Normal
            !canReport -> EndKind.NotStarted
            turns <= 2 -> EndKind.Short
            else -> EndKind.Normal
        }

    /** Called from the screen once it knows the UI language. Runs once per screen. */
    fun start(locale: ApiLocale) {
        if (started) return
        started = true
        connect(locale)
    }

    /** Try again after a failed start, or a call that dropped with nothing said. */
    fun retry(locale: ApiLocale) = connect(locale)

    private fun connect(locale: ApiLocale) {
        val caseId = case?.id ?: return
        error = null
        ended = null
        left = false
        phase = VoicePhase.Connecting
        viewModelScope.launch {
            try {
                val ticket = api.voiceSession(caseId, locale)
                call.start(
                    VoiceCallSetup(ticket.conversationToken, ticket.dynamicVariables, ticket.extraBody, if (locale == ApiLocale.Zh) "zh" else "en"),
                    this@VoiceViewModel,
                )
                timeout = launch {
                    delay(CONNECT_TIMEOUT_MILLIS)
                    if (phase == VoicePhase.Connecting) {
                        call.hangUp()
                        onEnded(VoiceCallEnd.Dropped)
                    }
                }
            } catch (e: ApiException) {
                phase = VoicePhase.Over
                error = e.toError()
            }
        }
    }

    fun toggleMute() {
        muted = !muted
        call.setMuted(muted)
    }

    /** The end sheet is open: what's said while deciding isn't a turn. Closing it restores the mic. */
    fun holdMic(hold: Boolean) {
        if (phase == VoicePhase.Listening || phase == VoicePhase.Speaking) call.setMuted(hold || muted)
    }

    /** The trainee ended the call. The transcript stays for the report. */
    fun hangUp() {
        if (phase == VoicePhase.Over) return
        call.hangUp()
        // Nothing connected yet: no disconnect will come.
        if (phase == VoicePhase.Connecting) onEnded(VoiceCallEnd.HungUp)
    }

    /** Leaving the app, or "Need help?": hang up at once. No client's voice over the help page. */
    fun leave() {
        if (phase == VoicePhase.Over) return
        left = true
        hangUp()
    }

    fun openLive(locale: ApiLocale) {
        val caseId = case?.id ?: return
        live.open(caseId, locale, messages, turns)
    }

    fun retryLive(locale: ApiLocale) {
        val caseId = case?.id ?: return
        live.retry(caseId, locale, messages, turns)
    }

    override fun onCleared() = call.hangUp()

    override fun onConnected() {
        timeout?.cancel()
        // A new session starts when the line opens; the clock starts here.
        if (session.startedAt == null) {
            session.begin()
            session.markVoice()
        }
        phase = VoicePhase.Listening
        captions?.cancel()
        captions = viewModelScope.launch {
            while (true) {
                delay(CAPTION_TICK_MILLIS)
                val reply = messages.lastOrNull()?.takeIf { it.role == Role.Client } ?: continue
                caption.tick(CAPTION_TICK_MILLIS, phase == VoicePhase.Speaking, reply.text.length, VoiceTranscript.charsPerSecond(reply.text))
                shownChars = caption.shown
            }
        }
    }

    override fun onClientSpeaking(speaking: Boolean) {
        if (phase != VoicePhase.Over) phase = if (speaking) VoicePhase.Speaking else VoicePhase.Listening
    }

    override fun onCounselor(text: String) {
        showAll()
        update(VoiceTranscript.add(messages, Role.Counselor, text))
    }

    override fun onClient(text: String) {
        val last = messages.lastOrNull()
        if (last?.role != Role.Client) {
            caption.newReply()
            shownChars = 0
        } else if (caption.shown >= last.text.length) {
            caption.goOnFrom(last.text.length)
            shownChars = last.text.length
        }
        update(VoiceTranscript.add(messages, Role.Client, text))
        // The contract's limit: no room for another exchange. The client finishes this line first.
        if (messages.size >= ContractLimits.MAX_MESSAGES - 1) {
            atLimit = true
            call.hangUp()
        }
    }

    override fun onClientCorrected(original: String, said: String) {
        showAll()
        update(VoiceTranscript.correct(messages, original, said))
    }

    override fun onEnded(end: VoiceCallEnd) {
        timeout?.cancel()
        captions?.cancel()
        showAll()
        phase = VoicePhase.Over
        ended = end
        if (end == VoiceCallEnd.ClientLeft) session.markClientEnded()
    }

    private fun showAll() {
        caption.finish()
        shownChars = Int.MAX_VALUE
    }

    private fun update(value: List<Message>) {
        messages = value
        session.update(value)
    }
}
