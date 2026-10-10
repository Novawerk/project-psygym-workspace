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
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class CaseStoreTest {
    private val case = CaseSummary("c1", "cbt", LocalizedText("甲", "A"), LocalizedText("s", "s"))

    @Test
    fun forcedReloadDuringARequestRunsAfterIt() = runTest {
        // First call: still the old invite code, ends in 401. Second: the new code works.
        val firstCall = CompletableDeferred<Unit>()
        var calls = 0
        val api = object : PsygymApi {
            override suspend fun cases(): List<CaseSummary> {
                calls++
                if (calls == 1) {
                    firstCall.await()
                    throw ApiException(ApiErrorCode.InviteRequired)
                }
                return listOf(case)
            }
            override fun chat(request: TurnRequest): Flow<ChatEvent> = emptyFlow()
            override fun supervision(request: TurnRequest): Flow<String> = emptyFlow()
        }
        val store = CaseStore(api)
        val running = launch { store.load(force = true) }
        testScheduler.runCurrent()
        // The user saves a new code while the first request is still out.
        store.load(force = true)
        firstCall.complete(Unit)
        running.join()

        assertEquals(2, calls)
        assertNull(store.error)
        assertEquals(listOf(case), store.cases)
    }
}
