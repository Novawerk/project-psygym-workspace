package io.novawerk.psygym.domain.practice

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.data.api.toError
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Mid-session supervisor notes (docs/product/live-supervision.md): `/supervision` with
 * mode "live". Memory only: they go when the session goes, never into history or the report.
 *
 * - After 3 turns (L-1); at most 5 per session (L-2).
 * - Opening again with no new turn shows the last notes; a new turn makes new ones,
 *   which replace the old.
 * - Closing the sheet doesn't stop a note being written: it runs in [scope].
 */
class LiveNotes(private val api: PsygymApi, private val scope: CoroutineScope) {

    /** The latest notes, Markdown "- " items. Empty until the first ones arrive. */
    var text by mutableStateOf("")
        private set

    /** The turn the latest notes looked at; 0 = none yet. */
    var turn by mutableStateOf(0)
        private set

    /** Notes made so far this session (only the ones that came back count). */
    var made by mutableStateOf(0)
        private set

    var writing by mutableStateOf(false)
        private set

    var error by mutableStateOf<ApiError?>(null)
        private set

    private var job: Job? = null

    val usedUp: Boolean get() = made >= MAX_PER_SESSION

    /** The chip shows from the 3rd turn, unless switched off or the client has ended the session. */
    fun chipVisible(turns: Int, enabled: Boolean, clientEnded: Boolean): Boolean =
        enabled && !clientEnded && turns >= MIN_TURNS

    /** A dot on the chip: notes were seen and the conversation went on since. */
    fun hasNew(turns: Int): Boolean = made > 0 && !usedUp && turns > turn

    /**
     * The sheet opens: write new notes if there's something new to look at and notes are left;
     * otherwise just show the last ones.
     */
    fun open(caseId: String, locale: ApiLocale, transcript: List<Message>, turns: Int) {
        if (writing || usedUp) return
        val nothingNew = made > 0 && turns <= turn && error == null
        if (nothingNew) return
        write(caseId, locale, transcript, turns)
    }

    /** After an error: try the same turn again. */
    fun retry(caseId: String, locale: ApiLocale, transcript: List<Message>, turns: Int) {
        if (writing || usedUp) return
        write(caseId, locale, transcript, turns)
    }

    private fun write(caseId: String, locale: ApiLocale, transcript: List<Message>, turns: Int) {
        val request = TurnRequest(caseId, locale, transcript, mode = MODE)
        error = null
        writing = true
        // New notes replace the old: the sheet shows "reading…" until they start to arrive.
        text = ""
        turn = turns
        job?.cancel()
        job = scope.launch {
            val notes = StringBuilder()
            try {
                api.supervision(request).collect {
                    notes.append(it)
                    text = notes.toString()
                }
                if (notes.isEmpty()) error = ApiError(ApiErrorCode.Unknown) else made += 1
            } catch (e: ApiException) {
                error = e.toError()
            } finally {
                writing = false
            }
        }
    }

    companion object {
        const val MIN_TURNS = 3
        const val MAX_PER_SESSION = 5
        const val MODE = "live"
    }
}
