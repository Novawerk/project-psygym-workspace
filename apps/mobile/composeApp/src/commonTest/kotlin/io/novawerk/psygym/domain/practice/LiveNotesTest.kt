package io.novawerk.psygym.domain.practice

import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.ChatEvent
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LiveNotesTest {
    private val requests = mutableListOf<TurnRequest>()
    private var failNext = false
    private var gate: CompletableDeferred<Unit>? = null

    private val api = object : PsygymApi {
        override suspend fun cases() = emptyList<CaseSummary>()
        override fun chat(request: TurnRequest): Flow<ChatEvent> = emptyFlow()
        override fun supervision(request: TurnRequest): Flow<String> = flow {
            requests += request
            if (failNext) {
                failNext = false
                throw ApiException(ApiErrorCode.ModelUnavailable)
            }
            emit("- 你说「你好」，好在开放。")
            gate?.await()
            emit("\n- 接下来可以……")
        }
    }

    private fun transcript(turns: Int) = (1..turns).flatMap { listOf(Message(Role.Counselor, "c$it"), Message(Role.Client, "r$it")) }

    private fun TestScope.notes() = LiveNotes(api, this)

    @Test
    fun theChipShowsFromTheThirdTurnUnlessSwitchedOffOrEnded() = runTest {
        val n = notes()
        assertFalse(n.chipVisible(turns = 2, enabled = true, clientEnded = false))
        assertTrue(n.chipVisible(turns = 3, enabled = true, clientEnded = false))
        assertFalse(n.chipVisible(turns = 5, enabled = false, clientEnded = false))
        assertFalse(n.chipVisible(turns = 5, enabled = true, clientEnded = true))
    }

    @Test
    fun opensAskForLiveNotesAndDontRepeatWithoutANewTurn() = runTest {
        val n = notes()
        n.open("c1", ApiLocale.Zh, transcript(3), 3)
        advanceUntilIdle()
        assertEquals("live", requests.single().mode)
        assertNull(requests.single().durationSec)
        assertEquals(3, n.turn)
        assertEquals(1, n.made)
        assertTrue(n.text.startsWith("- 你说"))
        // Opening again with nothing new: the same notes, no new request.
        n.open("c1", ApiLocale.Zh, transcript(3), 3)
        advanceUntilIdle()
        assertEquals(1, requests.size)
        assertFalse(n.hasNew(3))
        // A new turn: a dot, and new notes on opening.
        assertTrue(n.hasNew(4))
        n.open("c1", ApiLocale.Zh, transcript(4), 4)
        advanceUntilIdle()
        assertEquals(2, requests.size)
        assertEquals(4, n.turn)
    }

    @Test
    fun atMostFivePerSession() = runTest {
        val n = notes()
        for (t in 3..9) {
            n.open("c1", ApiLocale.Zh, transcript(t), t)
            advanceUntilIdle()
        }
        assertEquals(5, requests.size)
        assertTrue(n.usedUp)
        assertEquals(7, n.turn, "the last notes are kept")
        assertFalse(n.hasNew(10), "no dot once used up")
    }

    @Test
    fun aFailureDoesntCountAndCanBeRetried() = runTest {
        val n = notes()
        failNext = true
        n.open("c1", ApiLocale.Zh, transcript(3), 3)
        advanceUntilIdle()
        assertEquals(ApiErrorCode.ModelUnavailable, n.error?.code)
        assertEquals(0, n.made)
        n.retry("c1", ApiLocale.Zh, transcript(3), 3)
        advanceUntilIdle()
        assertNull(n.error)
        assertEquals(1, n.made)
    }

    @Test
    fun closingTheSheetDoesntStopTheNotes() = runTest {
        // The notes run in the screen's scope, not the sheet's: nothing to cancel on close.
        gate = CompletableDeferred()
        val n = notes()
        n.open("c1", ApiLocale.Zh, transcript(3), 3)
        advanceUntilIdle()
        assertTrue(n.writing)
        gate!!.complete(Unit)
        advanceUntilIdle()
        assertFalse(n.writing)
        assertTrue(n.text.contains("接下来"))
    }

    @Test
    fun aFailedRewriteKeepsTheLastNotesAndTheDot() = runTest {
        val n = notes()
        assertFalse(n.hasContent, "nothing to show yet: the sheet stays closed")
        n.open("c1", ApiLocale.Zh, transcript(3), 3)
        advanceUntilIdle()
        val good = n.text
        failNext = true
        n.open("c1", ApiLocale.Zh, transcript(4), 4)
        advanceUntilIdle()
        assertEquals(good, n.text)
        assertEquals(good, n.shownText)
        assertEquals(3, n.turn)
        assertEquals(3, n.shownTurn)
        assertTrue(n.hasNew(4), "the dot stays: turn 4 hasn't been looked at")
        assertEquals(1, n.made)
        assertTrue(n.hasContent)
    }
}
