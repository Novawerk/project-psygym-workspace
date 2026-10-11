package io.novawerk.psygym.domain.practice

import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.LocalizedText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/** The clock stops when the client ends the session (audit C), and restarts with a new one. */
class PracticeSessionClockTest {
    private val demoCase = CaseSummary("c1", "cbt", LocalizedText("甲", "A"), LocalizedText("s", "s"))

    @Test
    fun clockStopsAtSessionEnd() {
        val session = PracticeSession().apply { select(demoCase); begin() }
        Thread.sleep(30)
        session.markClientEnded()
        val atEnd = session.elapsed
        Thread.sleep(60)
        assertEquals(atEnd, session.elapsed)

        session.begin()
        Thread.sleep(30)
        assertTrue(session.elapsed > Duration.ZERO && session.elapsed < atEnd + 1.seconds)
    }

}
