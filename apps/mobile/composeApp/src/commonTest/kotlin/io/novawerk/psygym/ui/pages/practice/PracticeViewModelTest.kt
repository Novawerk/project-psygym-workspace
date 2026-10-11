package io.novawerk.psygym.ui.pages.practice

import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.ChatEvent
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.LocalizedText
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import io.novawerk.psygym.domain.practice.PracticeSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class PracticeViewModelTest {

    private val demoCase = CaseSummary("c1", "cbt", LocalizedText("甲", "A"), LocalizedText("s", "s"))
    private val requests = mutableListOf<TurnRequest>()
    private var replies = ArrayDeque<Flow<ChatEvent>>()

    private val api = object : PsygymApi {
        override suspend fun cases() = listOf(demoCase)
        override fun chat(request: TurnRequest): Flow<ChatEvent> {
            requests += request
            return replies.removeAt(0)
        }
        override fun supervision(request: TurnRequest): Flow<String> = flow { }
    }

    private fun viewModel() = PracticeViewModel(api, PracticeSession().apply { select(demoCase) })

    @BeforeTest
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun halfReplyIsKeptMarkedAndNeverSentBack() = runTest {
        replies += flow {
            emit(ChatEvent.Delta("我也"))
            throw ApiException(ApiErrorCode.ModelUnavailable)
        }
        replies += flow { emit(ChatEvent.Delta("我也不知道。")) }
        val vm = viewModel()

        vm.send("你好", ApiLocale.Zh)
        assertEquals(ApiErrorCode.ModelUnavailable, vm.error?.code)
        assertEquals(listOf(false, true), vm.items.map { it.incomplete })
        assertEquals("我也", vm.items.last().message.text)
        assertFalse(vm.canEnd)

        vm.retry(ApiLocale.Zh)
        // The retry asks for the whole turn: the broken half is not in the request.
        assertEquals(listOf(Message(Role.Counselor, "你好")), requests.last().messages)
        assertEquals(listOf(Message(Role.Counselor, "你好"), Message(Role.Client, "我也不知道。")), vm.items.map { it.message })
        assertTrue(vm.items.none { it.incomplete })
        assertTrue(vm.canEnd)
    }

    @Test
    fun sessionEndLocksTheInput() = runTest {
        replies += flow {
            emit(ChatEvent.Delta("我想今天先到这里。"))
            emit(ChatEvent.SessionEnd)
        }
        val session = PracticeSession().apply { select(demoCase) }
        val vm = PracticeViewModel(api, session)
        vm.send("你好", ApiLocale.Zh)
        assertTrue(vm.clientEnded)
        assertTrue(session.clientEnded)
        assertFalse(vm.canSend)
        assertTrue(vm.canEnd)
        assertEquals(EndKind.Normal, vm.endKind)
    }

    @Test
    fun endSheetKindFollowsTheConversation() = runTest {
        repeat(3) { replies += flow { emit(ChatEvent.Delta("嗯。")) } }
        val vm = viewModel()
        assertEquals(EndKind.NotStarted, vm.endKind)
        vm.send("一", ApiLocale.Zh)
        assertEquals(EndKind.Short, vm.endKind)
        vm.send("二", ApiLocale.Zh)
        vm.send("三", ApiLocale.Zh)
        assertEquals(EndKind.Normal, vm.endKind)
        assertEquals(3, vm.turns)
    }

    @Test
    fun nothingArrivedLeavesNoBubble() = runTest {
        replies += flow { throw ApiException(ApiErrorCode.Network) }
        val vm = viewModel()
        vm.send("你好", ApiLocale.Zh)
        assertEquals(ApiErrorCode.Network, vm.error?.code)
        assertEquals(listOf(Role.Counselor), vm.items.map { it.message.role })
    }
}
