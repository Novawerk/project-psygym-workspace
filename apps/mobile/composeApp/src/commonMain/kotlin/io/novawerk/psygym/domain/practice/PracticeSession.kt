package io.novawerk.psygym.domain.practice

import io.novawerk.psygym.di.AppScope
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import me.tatarka.inject.annotations.Inject
import kotlin.random.Random
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Instant
import kotlin.time.TimeMark
import kotlin.time.TimeSource

/**
 * The practice in progress, in memory. When it ends, the report screen saves it to
 * [io.novawerk.psygym.domain.history.HistoryRepository] if the user keeps history.
 */
@AppScope
@Inject
class PracticeSession {
    var case: CaseSummary? = null
        private set
    var transcript: List<Message> = emptyList()
        private set

    /** The client ended the session in character (`session_end`). No more input. */
    var clientEnded: Boolean = false
        private set

    /** Names the saved record. New for every session. */
    var id: String = ""
        private set

    var startedAt: Instant? = null
        private set
    private var startMark: TimeMark? = null

    val elapsed: Duration get() = startMark?.elapsedNow() ?: Duration.ZERO

    /** A turn = one counselor message. */
    val turns: Int get() = transcript.count { it.role == Role.Counselor }

    /** Pick a case. The clock starts when the session opens, not here. */
    fun select(case: CaseSummary) {
        this.case = case
        reset()
    }

    /** The session screen opened: start a fresh session for the selected case. */
    fun begin() {
        reset()
        startedAt = Clock.System.now().also { id = "${it.toEpochMilliseconds()}-${Random.nextInt(0, 1_000_000)}" }
        startMark = TimeSource.Monotonic.markNow()
    }

    fun update(messages: List<Message>) {
        transcript = messages
    }

    fun markClientEnded() {
        clientEnded = true
    }

    /** The practice is over. The case stays selected so "Practise this case again" works. */
    fun finish() = reset()

    fun clear() {
        case = null
        reset()
    }

    private fun reset() {
        transcript = emptyList()
        clientEnded = false
        startedAt = null
        startMark = null
        id = ""
    }
}
