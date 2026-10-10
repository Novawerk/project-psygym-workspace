package io.novawerk.psygym.ui.pages.supervision

import io.novawerk.psygym.data.api.ChatEvent
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.domain.history.HistoryRepository
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.LocalizedText
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import io.novawerk.psygym.domain.practice.PracticeSession
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okio.Path.Companion.toPath
import okio.fakefilesystem.FakeFileSystem
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class SupervisionViewModelTest {
    private val demoCase = CaseSummary("c1", "cbt", LocalizedText("甲", "A"), LocalizedText("s", "s"))
    private val reportGate = CompletableDeferred<Unit>()

    private val api = object : PsygymApi {
        override suspend fun cases() = listOf(demoCase)
        override fun chat(request: TurnRequest): Flow<ChatEvent> = emptyFlow()
        override fun supervision(request: TurnRequest): Flow<String> = flow {
            emit("## 做得好的地方\n")
            reportGate.await()
            emit("- 开放")
        }
    }

    private fun session() = PracticeSession().apply {
        select(demoCase)
        begin()
        update(listOf(Message(Role.Counselor, "你好"), Message(Role.Client, "嗯")))
    }

    @BeforeTest
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun withHistoryOnAFinishedReportLeavesWithoutAsking() = runTest {
        val history = HistoryRepository("/h".toPath(), FakeFileSystem())
        val vm = SupervisionViewModel(api, session(), history)
        vm.start(ApiLocale.Zh)
        // Still writing: leaving would lose the rest, so ask.
        assertTrue(vm.leaveNeedsConfirm)
        reportGate.complete(Unit)
        assertTrue(vm.done)
        // Saved in history: no confirm.
        assertFalse(vm.leaveNeedsConfirm)
    }

    @Test
    fun withHistoryOffLeavingAlwaysAsks() = runTest {
        val vm = SupervisionViewModel(api, session(), history = null)
        vm.start(ApiLocale.Zh)
        reportGate.complete(Unit)
        assertTrue(vm.done)
        assertTrue(vm.leaveNeedsConfirm)
    }
}
