package io.novawerk.psygym.ui.pages.supervision

import kotlin.test.assertEquals
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import io.novawerk.psygym.domain.auth.accountKey
import io.novawerk.psygym.data.api.ChatEvent
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.domain.history.HistoryRepository
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.LocalizedText
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import io.novawerk.psygym.domain.model.PreviousSession
import io.novawerk.psygym.domain.practice.PracticeSession
import io.novawerk.psygym.domain.practice.SessionPlan
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

    @Test
    fun theReportIsSavedUnderWhoPractisedEvenIfSomeoneElseSignsIn() = runTest {
        val fs = FakeFileSystem()
        val history = HistoryRepository("/h".toPath(), fs)
        val a = accountKey("a@example.com")
        val b = accountKey("b@example.com")
        history.setOwner(a)
        val vm = SupervisionViewModel(api, session(), history)
        vm.start(ApiLocale.Zh)
        // A's session expired and B signed in before the report finished.
        history.setOwner(b)
        reportGate.complete(Unit)
        // Saves run outside the screen's scope: wait for them on the real clock.
        withContext(Dispatchers.Default) {
            repeat(100) {
                if (fs.list("/h".toPath()).isNotEmpty() && fs.read(fs.list("/h".toPath()).single()) { readUtf8() }.contains("开放")) return@withContext
                delay(20)
            }
        }
        assertEquals(emptyList(), history.sessions.value)
        history.setOwner(a)
        assertEquals(1, history.sessions.value!!.size)
        assertTrue(history.sessions.value!!.single().reportComplete)
    }

    @Test
    fun aFollowUpSendsItsSessionAndKeepsTheNoteForTheNextOne() = runTest {
        val fs = FakeFileSystem()
        val history = HistoryRepository("/h".toPath(), fs)
        history.setOwner(accountKey("a@example.com"))
        val seen = mutableListOf<TurnRequest>()
        val followApi = object : PsygymApi {
            override suspend fun cases() = listOf(demoCase)
            override fun chat(request: TurnRequest): Flow<ChatEvent> = emptyFlow()
            override fun supervision(request: TurnRequest): Flow<String> = flow {
                seen += request
                emit("## 做得好的地方\n- 开放")
            }
            override suspend fun sessionSummary(request: TurnRequest): String {
                seen += request
                return "- 约好的事：散步。\n"
            }
        }
        val s = session().apply { choose(SessionPlan(2, "first-id", listOf(PreviousSession(1, "一")))) }
        val vm = SupervisionViewModel(followApi, s, history)
        vm.start(ApiLocale.Zh)
        withContext(Dispatchers.Default) {
            repeat(100) {
                val saved = history.sessions.value?.singleOrNull()
                if (saved != null && saved.reportComplete && saved.summary.isNotEmpty()) return@withContext
                delay(20)
            }
        }
        val saved = history.sessions.value!!.single()
        assertEquals(2, saved.sessionNumber)
        assertEquals("first-id", saved.courseId)
        assertEquals("- 约好的事：散步。", saved.summary)
        assertTrue(saved.reportComplete)
        assertEquals(listOf(2, 2), seen.map { it.session?.number })
    }

    @Test
    fun withHistoryOffNoNoteIsAskedFor() = runTest {
        var asked = false
        val quiet = object : PsygymApi by api {
            override suspend fun sessionSummary(request: TurnRequest): String {
                asked = true
                return "x"
            }
        }
        val vm = SupervisionViewModel(quiet, session(), history = null)
        vm.start(ApiLocale.Zh)
        reportGate.complete(Unit)
        assertFalse(asked)
    }
}
