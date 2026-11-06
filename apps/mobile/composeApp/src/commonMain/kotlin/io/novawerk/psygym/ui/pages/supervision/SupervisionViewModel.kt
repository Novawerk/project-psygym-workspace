package io.novawerk.psygym.ui.pages.supervision

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.data.api.toError
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.history.HistoryRepository
import io.novawerk.psygym.domain.history.SavedSession
import io.novawerk.psygym.domain.model.SessionInfo
import io.novawerk.psygym.domain.model.TurnRequest
import io.novawerk.psygym.domain.model.durationSec
import io.novawerk.psygym.domain.practice.PracticeSession
import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.time.Duration
import kotlin.time.Instant

@OptIn(DelicateCoroutinesApi::class)
class SupervisionViewModel(
    private val api: PsygymApi,
    private val session: PracticeSession,
    /** Null when the user doesn't keep history. */
    private val history: HistoryRepository?,
) : ViewModel() {

    // Captured once: the session object is reset when the user moves on.
    val case: CaseSummary? = session.case
    private val transcript = session.transcript
    val startedAt: Instant? = session.startedAt
    val duration: Duration = session.elapsed
    val turns: Int = session.turns
    private val sessionId = session.id
    val voice: Boolean = session.voice
    /** Which session of the case (docs/decisions/0014). */
    val plan = session.plan

    // Whose practice this is, fixed now: if someone else signs in before the report is saved,
    // it still goes to the person who practised (login.md H6).
    private val owner = history?.currentOwner
    private val endedAt = startedAt?.plus(duration)

    var report by mutableStateOf("")
        private set
    var streaming by mutableStateOf(false)
        private set
    var error by mutableStateOf<ApiError?>(null)
        private set

    /** The note for the next session (`POST /session-summary`). Only asked for when history is kept. */
    var summary by mutableStateOf("")
        private set

    /** False after a restart: the in-memory practice is gone. */
    val hasPractice: Boolean get() = case != null

    val done: Boolean get() = !streaming && error == null && report.isNotEmpty()

    /**
     * Leaving needs a confirm only when something would be lost: the report is still being
     * written, or history is off so the finished report isn't kept anywhere.
     */
    val leaveNeedsConfirm: Boolean get() = streaming || history == null

    private var job: Job? = null
    private var started = false

    /** Called from the screen once it knows the UI language. Runs once per screen. */
    fun start(locale: ApiLocale) {
        if (started) return
        started = true
        // Saved now, marked "report unfinished"; updated when the report is in.
        save(complete = false)
        load(locale)
        summarize(locale)
    }

    /**
     * Asks for the note the next session carries, beside the report. Only when the practice is
     * kept: without history there is no next session to carry it. A failure leaves it empty;
     * the next session then goes on without this one's note.
     */
    private fun summarize(locale: ApiLocale) {
        if (history == null) return
        val caseId = case?.id ?: return
        if (transcript.isEmpty()) return
        // Outlives this screen, like the save: leaving early must not lose the note.
        GlobalScope.launch {
            val note = try {
                api.sessionSummary(TurnRequest(caseId, locale, transcript, session = plan.wire))
            } catch (e: ApiException) {
                return@launch
            }
            summary = note.trim().take(SessionInfo.MAX_SUMMARY_CHARS)
            save(complete = report.isNotEmpty() && !streaming && error == null)
        }
    }

    fun load(locale: ApiLocale) {
        val caseId = case?.id ?: return
        // The clock stopped when the client ended the session (PracticeSession.elapsed).
        val request = TurnRequest(caseId, locale, transcript, durationSec = durationSec(duration), session = plan.wire)
        report = ""
        error = null
        streaming = true
        job?.cancel()
        job = viewModelScope.launch {
            try {
                api.supervision(request).collect { report += it }
                if (report.isEmpty()) error = ApiError(ApiErrorCode.Unknown) else save(complete = true)
            } catch (e: ApiException) {
                error = e.toError()
            } finally {
                streaming = false
            }
        }
    }

    private fun save(complete: Boolean) {
        val repo = history ?: return
        val case = case ?: return
        val started = startedAt ?: return
        if (sessionId.isEmpty() || transcript.isEmpty()) return
        val record = SavedSession(
            id = sessionId,
            case = case,
            startedAtMillis = started.toEpochMilliseconds(),
            endedAtMillis = (endedAt ?: started).toEpochMilliseconds(),
            messages = transcript,
            report = if (complete) report else "",
            reportComplete = complete,
            owner = owner,
            voice = voice,
            sessionNumber = plan.number,
            courseId = plan.courseId,
            summary = summary,
        )
        // Outlives this screen: leaving mid-report must not lose the save. One after another, so
        // the last state written is the last one asked for (the report and the note finish apart).
        val before = lastSave
        lastSave = GlobalScope.launch {
            before?.join()
            repo.save(record)
        }
    }

    private var lastSave: Job? = null

    /** The practice is over. The case stays selected for "Practise this case again". */
    fun finish() {
        job?.cancel()
        session.finish()
    }
}
