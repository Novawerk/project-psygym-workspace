package io.novawerk.psygym.domain.auth

import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.FakePsygymApi
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SessionStoreTest {
    @Test
    fun savesLoadsAndClears() = runTest {
        val secure = MemorySecureStore()
        SessionStore(secure).save(StoredSession("tok", "lin@example.com"))
        val again = SessionStore(secure).apply { load() }
        assertEquals("tok", again.token())
        again.clear()
        assertNull(secure.value)
        assertNull(again.token())
    }

    @Test
    fun aRefusedSessionIsForgottenAndFlagged() = runTest {
        val sessions = SessionStore(MemorySecureStore()).apply { load(); save(StoredSession("tok", "a@b.co")) }
        // Any call the server refuses for sign-in reasons.
        val refusing = object : io.novawerk.psygym.data.api.Backend by FakePsygymApi() {
            override suspend fun cases() = throw ApiException(ApiErrorCode.SessionExpired)
            override fun chat(request: TurnRequest) = flow<io.novawerk.psygym.data.api.ChatEvent> { throw ApiException(ApiErrorCode.UpdateRequired) }
        }
        val guarded = SessionGuard(refusing, sessions)
        assertFailsWith<ApiException> { guarded.cases() }
        assertNull(sessions.session.value)
        assertTrue(sessions.expired.value)
        sessions.consumeExpired()
        sessions.save(StoredSession("tok2", "a@b.co"))
        // In a stream too; the error still reaches the screen.
        val e = assertFailsWith<ApiException> { guarded.chat(TurnRequest("c", ApiLocale.Zh, listOf(Message(Role.Counselor, "hi")))).toList() }
        assertEquals(ApiErrorCode.UpdateRequired, e.code)
        assertTrue(sessions.expired.value)
    }

    @Test
    fun otherErrorsLeaveTheSessionAlone() = runTest {
        val sessions = SessionStore(MemorySecureStore()).apply { load(); save(StoredSession("tok", "a@b.co")) }
        val failing = object : io.novawerk.psygym.data.api.Backend by FakePsygymApi() {
            override suspend fun cases() = throw ApiException(ApiErrorCode.Network)
        }
        assertFailsWith<ApiException> { SessionGuard(failing, sessions).cases() }
        assertEquals("tok", sessions.token())
        assertTrue(!sessions.expired.value)
    }

    @Test
    fun anExpiredSessionRemembersWhoseItWas() = runTest {
        val sessions = SessionStore(MemorySecureStore()).apply { load(); save(StoredSession("tok", "A@example.com")) }
        sessions.markExpired()
        assertEquals(accountKey("a@example.com"), sessions.expiredAccount)
        // Back to the page only for the same person.
        assertTrue(LoginFlow.returnsToPage(true, sessions.expiredAccount, accountKey("a@example.com")))
        assertTrue(!LoginFlow.returnsToPage(true, sessions.expiredAccount, accountKey("b@example.com")))
        assertTrue(!LoginFlow.returnsToPage(false, sessions.expiredAccount, accountKey("a@example.com")))
    }

    @Test
    fun aStoreThatRefusesToWriteIsReportedNotThrownAtTheUser() = runTest {
        val broken = object : SecureStore {
            override suspend fun read(): String? = null
            override suspend fun write(value: String?) = throw SecureStoreException("keystore is broken")
        }
        val sessions = SessionStore(broken).apply { load() }
        assertFailsWith<SecureStoreException> { sessions.save(StoredSession("tok", "a@b.co")) }
        assertNull(sessions.session.value, "nothing half-saved")
        // Clearing never throws: the app is signed out either way.
        sessions.clear()
    }
}
