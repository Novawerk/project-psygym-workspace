package io.novawerk.psygym.domain.practice

import io.novawerk.psygym.domain.model.PreviousSession
import io.novawerk.psygym.domain.model.SessionInfo

/**
 * Which session of a case the trainee practises (docs/decisions/0014-follow-up-sessions.md):
 * the first, or the next one of a course, with the notes on the sessions before it.
 */
data class SessionPlan(
    val number: Int = 1,
    /** The course it continues (its first session's id); null for a first session. */
    val courseId: String? = null,
    val previous: List<PreviousSession> = emptyList(),
) {
    val isFollowUp: Boolean get() = number > 1

    /** What the requests carry: nothing for a first session, so they stay exactly as before. */
    val wire: SessionInfo? get() = if (isFollowUp) SessionInfo(number, previous) else null

    companion object {
        val FIRST = SessionPlan()
    }
}
