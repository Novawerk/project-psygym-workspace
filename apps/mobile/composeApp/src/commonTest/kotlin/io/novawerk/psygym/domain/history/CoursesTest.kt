package io.novawerk.psygym.domain.history

import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.LocalizedText
import io.novawerk.psygym.domain.model.PreviousSession
import io.novawerk.psygym.domain.model.SessionInfo
import io.novawerk.psygym.domain.practice.SessionPlan
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Follow-up sessions (docs/decisions/0014): courses from the saved history. */
class CoursesTest {
    private fun case(id: String = "c1", sessions: Int = 3) =
        CaseSummary(id, "cbt", LocalizedText("甲", "A"), LocalizedText("s", "s"), sessions = sessions)

    private fun saved(
        id: String,
        at: Long,
        number: Int = 1,
        course: String? = null,
        summary: String = "",
        case: CaseSummary = case(),
    ) = SavedSession(id, case, at, at + 1, emptyList(), sessionNumber = number, courseId = course, summary = summary)

    @Test
    fun oldRecordsAreEachAFirstSessionOfTheirOwn() {
        val courses = listOf(saved("a", 1), saved("b", 2)).courses()
        assertEquals(listOf("b", "a"), courses.map { it.id })
        assertEquals(listOf(1, 1), courses.map { it.lastNumber })
    }

    @Test
    fun followUpsJoinTheirFirstSessionInOrder() {
        val list = listOf(saved("a", 1, summary = "一"), saved("x", 5), saved("c", 9, 3, "a", "三"), saved("b", 4, 2, "a", "二"))
        // The course practised most recently comes first: "a" (its last session at 9), then "x".
        assertEquals(listOf("a", "x"), list.courses().map { it.id })
        val course = list.courses().first()
        assertEquals(listOf("a", "b", "c"), course.sessions.map { it.id })
        assertEquals(course, list.courseOf(list[3]))
        assertEquals(listOf(PreviousSession(1, "一"), PreviousSession(2, "二")), course.previousFor(3))
    }

    @Test
    fun theNextSessionOfTheLatestCourse() {
        val list = listOf(saved("a", 1, summary = "一"), saved("b", 2, 2, "a", "二"), saved("z", 0, case = case("other")))
        assertEquals(SessionPlan(3, "a", listOf(PreviousSession(1, "一"), PreviousSession(2, "二"))), list.nextSessionOf(case()))
        // The case has no session left.
        assertNull(list.nextSessionOf(case(sessions = 2)))
        // Never practised: only a first session.
        assertNull(list.nextSessionOf(case("new")))
        // A newer first session starts a new course: its session 2 is next.
        val restarted = list + saved("n", 10, summary = "新")
        assertEquals(SessionPlan(2, "n", listOf(PreviousSession(1, "新"))), restarted.nextSessionOf(case()))
    }

    @Test
    fun notesSkipBlanksKeepTheLaterOfARepeatAndAreCapped() {
        val long = "长".repeat(SessionInfo.MAX_SUMMARY_CHARS + 10)
        val list = listOf(
            saved("a", 1, summary = ""),
            saved("b", 2, 2, "a", "早"),
            saved("b2", 3, 2, "a", "晚"),
            saved("c", 4, 3, "a", long),
        )
        val previous = list.courses().single().previousFor(4)
        assertEquals(listOf(2, 3), previous.map { it.number })
        assertEquals("晚", previous[0].summary)
        assertEquals(SessionInfo.MAX_SUMMARY_CHARS, previous[1].summary.length)
    }

    @Test
    fun aFirstSessionPlanSendsNothing() {
        assertNull(SessionPlan.FIRST.wire)
        assertEquals(SessionInfo(2, listOf(PreviousSession(1, "x"))), SessionPlan(2, "a", listOf(PreviousSession(1, "x"))).wire)
    }
}
