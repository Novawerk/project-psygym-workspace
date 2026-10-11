package io.novawerk.psygym.data.api

import io.novawerk.psygym.domain.model.ApiLocale
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** Demo sign-in, debug builds: the login screens work without a server. */
class FakeAuthDebugTest {
    private val auth = FakeAuthApi(delayMillis = 0)

    @Test
    fun anExistingDemoAccountSignsInWithAnyCode() = runTest {
        auth.startSignIn("lin@example.com", ApiLocale.Zh)
        assertEquals("lin@example.com", auth.verify(" Lin@example.com", "482719").me.email)
    }

    @Test
    fun theDocumentedCodesShowTheErrorStates() = runTest {
        assertEquals(ApiErrorCode.InvalidCode, assertFailsWith<ApiException> { auth.verify("lin@example.com", FakeAuthApi.WRONG_CODE) }.code)
        assertEquals(ApiErrorCode.Network, assertFailsWith<ApiException> { auth.verify("lin@example.com", FakeAuthApi.OFFLINE_CODE) }.code)
    }

    @Test
    fun aNewEmailNeedsAnInviteCode() = runTest {
        assertEquals(ApiErrorCode.InviteRequired, assertFailsWith<ApiException> { auth.verify("new@example.com", "123456") }.code)
        assertEquals(ApiErrorCode.InviteInvalid, assertFailsWith<ApiException> { auth.verify("new@example.com", "123456", "short") }.code)
        auth.verify("new@example.com", "123456", "k7mpx2qr9wtd")
        // Now it has an account.
        auth.verify("new@example.com", "654321")
    }
}
