package io.novawerk.psygym.domain.practice

import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.ChatEvent
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.LocalizedText
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CaseStoreTest {
    private val case = CaseSummary("c1", "cbt", LocalizedText("甲", "A"), LocalizedText("s", "s"))

    /** Each call waits on its own gate, then returns cases or throws. */
    private class GatedApi : PsygymApi {
        val gates = mutableListOf<CompletableDeferred<Result<List<CaseSummary>>>>()
        override suspend fun cases(): List<CaseSummary> {
            val gate = CompletableDeferred<Result<List<CaseSummary>>>().also { gates += it }
            return gate.await().getOrThrow()
        }
        override fun chat(request: TurnRequest): Flow<ChatEvent> = emptyFlow()
        override fun supervision(request: TurnRequest): Flow<String> = emptyFlow()
    }

    @Test
    fun forcedLoadMidRequestCancelsItAndTheNewOneWins() = runTest {
        val api = GatedApi()
        val store = CaseStore(api, backgroundScope)
        store.load(force = true) // e.g. at startup, before the saved code is read
        testScheduler.runCurrent()
        store.load(force = true) // the code arrives: start over
        testScheduler.runCurrent()
        assertEquals(2, api.gates.size)
        // The first request was cancelled; it must not end the second one's loading.
        assertTrue(store.loading)
        api.gates[1].complete(Result.success(listOf(case)))
        testScheduler.runCurrent()
        assertFalse(store.loading)
        assertNull(store.error)
        assertEquals(listOf(case), store.cases)
    }

    @Test
    fun aLateAnswerFromAnOlderRequestIsIgnored() = runTest {
        val api = GatedApi()
        val store = CaseStore(api, backgroundScope)
        store.load(force = true)
        testScheduler.runCurrent()
        store.load(force = true)
        testScheduler.runCurrent()
        api.gates[1].complete(Result.success(listOf(case)))
        // The old request's 401 shows up afterwards (its gate ignores the cancel).
        api.gates[0].complete(Result.failure(ApiException(ApiErrorCode.InviteRequired)))
        testScheduler.runCurrent()
        assertNull(store.error)
        assertEquals(listOf(case), store.cases)
    }

    @Test
    fun aPlainLoadDoesNotStartASecondRequest() = runTest {
        val api = GatedApi()
        val store = CaseStore(api, backgroundScope)
        store.load()
        testScheduler.runCurrent()
        store.load()
        testScheduler.runCurrent()
        assertEquals(1, api.gates.size)
        api.gates[0].complete(Result.failure(ApiException(ApiErrorCode.Network)))
        testScheduler.runCurrent()
        assertEquals(ApiErrorCode.Network, store.error?.code)
        assertFalse(store.loading)
        // After an error, a plain load (opening C1) tries again.
        store.load()
        testScheduler.runCurrent()
        assertEquals(2, api.gates.size)
    }
}
