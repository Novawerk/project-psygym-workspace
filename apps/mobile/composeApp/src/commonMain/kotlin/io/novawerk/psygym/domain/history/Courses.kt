package io.novawerk.psygym.domain.history

import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.PreviousSession
import io.novawerk.psygym.domain.model.SessionInfo
import io.novawerk.psygym.domain.practice.SessionPlan

/**
 * The sessions with one client that follow on from each other (docs/decisions/0014): a first
 * session and the follow-ups started from it. Oldest first. Kept only in the saved history.
 */
data class Course(val id: String, val sessions: List<SavedSession>) {
    val last: SavedSession get() = sessions.last()
    val caseId: String get() = last.case.id
    val lastNumber: Int get() = sessions.maxOf { it.sessionNumber }

    /** Notes for session [number]: the sessions before it that have one, oldest first, the last few. */
    fun previousFor(number: Int): List<PreviousSession> = sessions
        .filter { it.sessionNumber < number && it.summary.isNotBlank() }
        .sortedWith(SESSION_ORDER)
        .associateBy { it.sessionNumber } // a session done twice: the later note
        .values.toList()
        .takeLast(SessionInfo.MAX_PREVIOUS)
        .map { PreviousSession(it.sessionNumber, it.summary.trim().take(SessionInfo.MAX_SUMMARY_CHARS)) }

    /** The session after the last one, if [sessions] (the case's count) allows it. */
    fun next(sessions: Int): SessionPlan? {
        val number = lastNumber + 1
        if (number > sessions) return null
        return SessionPlan(number, id, previousFor(number))
    }
}

/** By session number, then by when it started. */
private val SESSION_ORDER = Comparator<SavedSession> { a, b ->
    if (a.sessionNumber != b.sessionNumber) a.sessionNumber.compareTo(b.sessionNumber) else a.startedAtMillis.compareTo(b.startedAtMillis)
}

/** A saved session's course: its own id when it began one. */
val SavedSession.course: String get() = courseId ?: id

/** Sessions grouped into courses, the most recently practised first. */
fun List<SavedSession>.courses(): List<Course> = groupBy { it.course }
    .map { (id, list) -> Course(id, list.sortedWith(SESSION_ORDER)) }
    .sortedByDescending { c -> c.sessions.maxOf { it.startedAtMillis } }

/** The course [session] belongs to. */
fun List<SavedSession>.courseOf(session: SavedSession): Course? = courses().firstOrNull { it.id == session.course }

/** The next session of the most recently practised course of [case], if one is left. */
fun List<SavedSession>.nextSessionOf(case: CaseSummary): SessionPlan? =
    courses().firstOrNull { it.caseId == case.id }?.next(case.sessions)
