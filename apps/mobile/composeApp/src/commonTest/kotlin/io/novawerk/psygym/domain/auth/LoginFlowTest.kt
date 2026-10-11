package io.novawerk.psygym.domain.auth

import io.novawerk.psygym.data.api.Account
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.AuthApi
import io.novawerk.psygym.data.api.AuthSession
import io.novawerk.psygym.domain.model.ApiLocale
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds
import kotlin.time.TestTimeSource

class MemorySecureStore : SecureStore {
    var value: String? = null
    override suspend fun read() = value
    override suspend fun write(value: String?) {
        this.value = value
    }
}

/** A scripted server: verify answers from [verifyAnswers] in order, then succeeds. */
private class ScriptedAuth : AuthApi {
    val starts = mutableListOf<String>()
    val verifies = mutableListOf<Triple<String, String, String?>>()
    var startError: ApiException? = null
    val verifyAnswers = ArrayDeque<ApiErrorCode>()

    override suspend fun startSignIn(email: String, locale: ApiLocale) {
        startError?.let { throw it }
        starts += email
    }

    override suspend fun verify(email: String, code: String, inviteCode: String?): AuthSession {
        verifies += Triple(email, code, inviteCode)
        verifyAnswers.removeFirstOrNull()?.let { throw ApiException(it) }
        return AuthSession("tok", me = Account(email))
    }

    override suspend fun signOut(token: String) = Unit
    override suspend fun deleteAccount() = Unit
}

class LoginFlowTest {
    private val auth = ScriptedAuth()
    private val secure = MemorySecureStore()
    private val sessions = SessionStore(secure)
    private val time = TestTimeSource()
    private var legacy: String? = null

    private fun flow() = LoginFlow(auth, sessions, { legacy }, { legacy = null }, time)

    private suspend fun atCode(): LoginFlow = flow().apply {
        email = "  Lin@Example.com "
        sendCode(ApiLocale.Zh)
    }

    @Test
    fun anExistingAccountSignsInWithEmailAndCode() = runTest {
        val f = atCode()
        assertEquals(listOf("lin@example.com"), auth.starts)
        assertEquals(LoginStep.Code, f.step)
        f.submitCode("12 34-56")
        assertEquals(LoginStep.Done, f.step)
        assertEquals(Triple("lin@example.com", "123456", null), auth.verifies.single())
        assertEquals("tok", sessions.session.value?.token)
        assertEquals("lin@example.com", sessions.session.value?.email)
        // The token went to the secure store, nowhere else.
        assertTrue(secure.value!!.contains("tok"))
    }

    @Test
    fun aBadEmailIsNotSent() = runTest {
        val f = flow().apply { email = "lin@example" }
        f.sendCode(ApiLocale.Zh)
        assertEquals(LoginError.InvalidEmail, f.error)
        assertEquals(LoginStep.Email, f.step)
        assertTrue(auth.starts.isEmpty())
    }

    @Test
    fun aNewEmailGoesToTheInviteStepWithTheSameCode() = runTest {
        val f = atCode()
        auth.verifyAnswers += ApiErrorCode.InviteRequired
        f.submitCode("123456")
        assertEquals(LoginStep.Invite, f.step)
        assertNull(f.error)
        // invite_required isn't a try.
        assertEquals(0, f.tries)
        f.submitInvite(" K7MP-x2qr-9WTD ")
        assertEquals(LoginStep.Done, f.step)
        assertEquals(Triple("lin@example.com", "123456", "k7mpx2qr9wtd"), auth.verifies.last())
    }

    @Test
    fun fiveWrongCodesUseTheCodeUp() = runTest {
        val f = atCode()
        repeat(5) { auth.verifyAnswers += ApiErrorCode.InvalidCode }
        repeat(4) {
            f.submitCode("000000")
            assertEquals(LoginError.InvalidCode, f.error)
        }
        f.submitCode("000000")
        assertEquals(LoginError.CodeUsedUp, f.error)
        assertTrue(f.codeUsedUp)
        // Dead on the server: the app stops sending it.
        f.submitCode("123456")
        assertEquals(5, auth.verifies.size)
        // A new code starts over (after the resend wait).
        time += 60.seconds
        f.resend(ApiLocale.Zh)
        assertEquals(0, f.tries)
        assertTrue(f.resent)
        f.submitCode("123456")
        assertEquals(LoginStep.Done, f.step)
    }

    @Test
    fun wrongInviteCodesCountAsTriesOfTheCode() = runTest {
        val f = atCode()
        auth.verifyAnswers += ApiErrorCode.InvalidCode
        f.submitCode("000000") // 1 try
        auth.verifyAnswers += ApiErrorCode.InviteRequired
        f.submitCode("123456")
        repeat(4) { auth.verifyAnswers += ApiErrorCode.InviteInvalid }
        repeat(3) {
            f.submitInvite("wrongwrongxx")
            assertEquals(LoginError.InviteInvalid, f.error)
        }
        f.submitInvite("wrongwrongxx")
        assertEquals(LoginError.InviteUsedUp, f.error)
        assertTrue(f.codeUsedUp)
        // Back to L1 to send a new one.
        f.backToEmail()
        assertEquals(LoginStep.Email, f.step)
    }

    @Test
    fun anOldInstallSendsItsInviteCodeAndSkipsTheInviteStep() = runTest {
        legacy = "abc def"
        val f = atCode()
        f.submitCode("123456")
        assertEquals(Triple("lin@example.com", "123456", "abcdef"), auth.verifies.single())
        assertEquals(LoginStep.Done, f.step)
        assertNull(legacy, "used once, then forgotten")
    }

    @Test
    fun anOldInviteCodeThatNoLongerWorksShowsTheInviteStep() = runTest {
        legacy = "oldcode"
        val f = atCode()
        auth.verifyAnswers += ApiErrorCode.InviteInvalid
        f.submitCode("123456")
        assertEquals(LoginStep.Invite, f.step)
        assertNull(f.error)
        assertEquals(1, f.tries)
        assertNull(legacy)
        f.submitInvite("k7mpx2qr9wtd")
        assertEquals("k7mpx2qr9wtd", auth.verifies.last().third)
    }

    @Test
    fun offlineKeepsWhatWasTyped() = runTest {
        val f = atCode()
        auth.verifyAnswers += ApiErrorCode.Network
        f.submitCode("123456")
        assertEquals(LoginError.Network, f.error)
        assertEquals(LoginStep.Code, f.step)
        assertEquals(0, f.tries, "no connection isn't a try")
        assertEquals("  Lin@Example.com ", f.email)
        assertTrue(!f.busy)
    }

    @Test
    fun sendAgainWaitsSixtySecondsAndOfflineDoesntRestartTheWait() = runTest {
        val f = atCode()
        assertEquals(60, f.secondsUntilResend())
        time += 15.seconds
        assertEquals(45, f.secondsUntilResend())
        f.resend(ApiLocale.Zh)
        assertEquals(1, auth.starts.size, "not before the wait is over")
        time += 45.seconds
        assertEquals(0, f.secondsUntilResend())
        auth.startError = ApiException(ApiErrorCode.Network)
        f.resend(ApiLocale.Zh)
        assertEquals(LoginError.Network, f.error)
        assertEquals(0, f.secondsUntilResend())
    }

    @Test
    fun tooManySendsShowTheServersWait() = runTest {
        val f = flow().apply { email = "lin@example.com" }
        auth.startError = ApiException(ApiErrorCode.RateLimited, retryAfterSeconds = 42)
        f.sendCode(ApiLocale.En)
        assertEquals(LoginError.RateLimited(42), f.error)
        assertEquals(LoginStep.Email, f.step)
    }

    @Test
    fun aSessionThePhoneCantKeepShowsAnErrorOnTheCodeScreen() = runTest {
        val broken = object : SecureStore {
            override suspend fun read(): String? = null
            override suspend fun write(value: String?) = throw SecureStoreException("keystore is broken")
        }
        val f = LoginFlow(auth, SessionStore(broken).apply { load() }, { legacy }, { legacy = null }, time)
        f.email = "lin@example.com"
        f.sendCode(ApiLocale.Zh)
        f.submitCode("123456")
        assertEquals(LoginError.Storage, f.error)
        assertEquals(LoginStep.Code, f.step)
        assertTrue(!f.busy)
    }

    @Test
    fun codeDigitsKeepAsciiAndFullWidthDigitsOnly() {
        assertEquals("482719", LoginFlow.codeDigits(" 48-27 19\n"))
        assertEquals("482719", LoginFlow.codeDigits("４８２７１９"))
        // Other scripts' digits (Arabic-Indic here) aren't code digits.
        assertEquals("12", LoginFlow.codeDigits("1\u0663\u06642"))
    }

    @Test
    fun fullWidthDigitsSignIn() = runTest {
        val f = atCode()
        f.submitCode("１２３４５６")
        assertEquals("123456", auth.verifies.single().second)
        assertEquals(LoginStep.Done, f.step)
    }
}
