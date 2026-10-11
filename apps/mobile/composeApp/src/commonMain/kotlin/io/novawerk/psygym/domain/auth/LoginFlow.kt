package io.novawerk.psygym.domain.auth

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.AuthApi
import io.novawerk.psygym.domain.model.ApiLocale
import kotlin.time.Duration.Companion.seconds
import kotlin.time.TimeMark
import kotlin.time.TimeSource

/** What went wrong on L1–L3, for the screen to say (docs/product/login.md). */
sealed interface LoginError {
    data object InvalidEmail : LoginError
    data class RateLimited(val seconds: Int) : LoginError
    data object InvalidCode : LoginError

    /** This code has had its 5 tries: only "send again" is left. */
    data object CodeUsedUp : LoginError
    data object InviteInvalid : LoginError

    /** On L3: the code's 5 tries are gone (or it expired); go back and send a new one. */
    data object InviteUsedUp : LoginError
    data object Network : LoginError

    /** Signed in, but the phone's secure store wouldn't keep the session. */
    data object Storage : LoginError
    data object Other : LoginError
}

enum class LoginStep { Email, Code, Invite, Done }

/**
 * Sign-in, L1 → L2 → (new email) L3 (login.md §1–2, contract "Sign-in"). Keeps what the three
 * screens share: the email, the code (L3 sends the same code again), how many tries this code
 * has used, and when "send again" opens.
 *
 * The server answers every bad code with the same `invalid_code`, so we count tries ourselves:
 * after 5 (`invite_invalid` on L3 counts too) the code is dead on the server and we stop sending it.
 */
class LoginFlow(
    private val api: AuthApi,
    private val sessions: SessionStore,
    /** The invite code an older version of the app kept, if any: sent on the first verify. */
    private val legacyInvite: suspend () -> String?,
    private val clearLegacyInvite: suspend () -> Unit,
    private val time: TimeSource = TimeSource.Monotonic,
) {
    var step by mutableStateOf(LoginStep.Email)
        private set
    var email by mutableStateOf("")
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<LoginError?>(null)
        private set

    /** "We sent a new code." after a resend, until the next try. */
    var resent by mutableStateOf(false)
        private set

    /** Tries used by the current code. */
    var tries by mutableStateOf(0)
        private set

    private var code = ""
    private var resendAt: TimeMark? = null

    val emailLooksValid: Boolean get() = isValidEmail(email)

    /** True once this code is out of tries: no more submitting, only "send again". */
    val codeUsedUp: Boolean get() = tries >= MAX_TRIES

    /** Seconds until "send again" opens; 0 when it's open. */
    fun secondsUntilResend(): Int {
        val left = resendAt?.let { -it.elapsedNow() } ?: return 0
        // Rounded up: "1 s" until the very end, never "0 s" while it's still closed.
        return if (left.isPositive()) ((left.inWholeMilliseconds + 999) / 1000).toInt() else 0
    }

    /** L1: send the code. Moves to L2 when it went out. */
    suspend fun sendCode(locale: ApiLocale) {
        if (!emailLooksValid) {
            error = LoginError.InvalidEmail
            return
        }
        if (start(locale)) step = LoginStep.Code
    }

    /** L2: "send again". A new code: tries start over. */
    suspend fun resend(locale: ApiLocale) {
        if (secondsUntilResend() > 0) return
        if (start(locale)) resent = true
    }

    private suspend fun start(locale: ApiLocale): Boolean = run(onError = { e ->
        if (e.code == ApiErrorCode.RateLimited) {
            val wait = e.retryAfterSeconds ?: RESEND_SECONDS
            resendAt = time.markNow() + wait.seconds
            LoginError.RateLimited(wait)
        } else {
            commonError(e)
        }
    }) {
        api.startSignIn(email.trim().lowercase(), locale)
        tries = 0
        code = ""
        resendAt = time.markNow() + RESEND_SECONDS.seconds
        true
    } ?: false

    /** L2: the 6 digits (spaces and other characters are dropped). Signs in, or moves to L3. */
    suspend fun submitCode(input: String) {
        val digits = codeDigits(input)
        if (digits.length != CODE_LENGTH || codeUsedUp) return
        code = digits
        resent = false
        val legacy = legacyInvite()?.let(::normalizeInvite)?.takeIf { it.isNotEmpty() }
        run(onError = { e ->
            when (e.code) {
                ApiErrorCode.InviteRequired -> {
                    step = LoginStep.Invite
                    null
                }
                // The invite code the old app kept is no longer good: ask for a new one.
                ApiErrorCode.InviteInvalid -> {
                    tries += 1
                    clearLegacyInvite()
                    step = LoginStep.Invite
                    if (codeUsedUp) LoginError.InviteUsedUp else null
                }
                ApiErrorCode.InvalidCode -> {
                    tries += 1
                    if (codeUsedUp) LoginError.CodeUsedUp else LoginError.InvalidCode
                }
                else -> commonError(e)
            }
        }) {
            finish(api.verify(email.trim().lowercase(), digits, legacy))
        }
    }

    /** L3: the invite code, sent with the same email code. */
    suspend fun submitInvite(input: String) {
        val invite = normalizeInvite(input)
        if (invite.isEmpty() || codeUsedUp) return
        run(onError = { e ->
            when (e.code) {
                ApiErrorCode.InviteInvalid -> {
                    tries += 1
                    if (codeUsedUp) LoginError.InviteUsedUp else LoginError.InviteInvalid
                }
                // Expired, or out of tries on the server's count.
                ApiErrorCode.InvalidCode -> {
                    tries = MAX_TRIES
                    LoginError.InviteUsedUp
                }
                else -> commonError(e)
            }
        }) {
            finish(api.verify(email.trim().lowercase(), code, invite))
        }
    }

    /** "Change email" / "No invite code? Go back": start over on L1, email kept. */
    fun backToEmail() {
        step = LoginStep.Email
        error = null
        resent = false
    }

    /** Leaving L3 for L2 (back arrow): the same code can still be typed again. */
    fun backToCode() {
        step = LoginStep.Code
        error = null
    }

    fun clearError() {
        error = null
    }

    private suspend fun finish(session: io.novawerk.psygym.data.api.AuthSession) {
        try {
            sessions.save(StoredSession(session.token, session.me.email))
        } catch (e: SecureStoreException) {
            // Stay on this screen with a message; trying again usually works.
            error = LoginError.Storage
            return
        }
        clearLegacyInvite()
        step = LoginStep.Done
    }

    private fun commonError(e: ApiException): LoginError = when (e.code) {
        ApiErrorCode.Network, ApiErrorCode.Timeout -> LoginError.Network
        ApiErrorCode.RateLimited -> LoginError.RateLimited(e.retryAfterSeconds ?: RESEND_SECONDS)
        ApiErrorCode.InvalidRequest -> LoginError.InvalidEmail
        else -> LoginError.Other
    }

    /** Runs a call with the busy flag; inputs are kept whatever happens (login.md "没网时"). */
    private suspend fun <T> run(onError: suspend (ApiException) -> LoginError?, block: suspend () -> T): T? {
        if (busy) return null
        busy = true
        error = null
        return try {
            block()
        } catch (e: ApiException) {
            error = onError(e)
            null
        } finally {
            busy = false
        }
    }

    companion object {
        const val CODE_LENGTH = 6
        const val MAX_TRIES = 5
        const val RESEND_SECONDS = 60

        private val EMAIL = Regex("""^[^\s@]+@[^\s@]+\.[^\s@]+$""")

        fun isValidEmail(email: String): Boolean = email.trim().let { it.length <= 254 && EMAIL.matches(it) }

        /**
         * After signing in again from an expired session: back to that page only if it's the same
         * account. Someone else signing in must not land in the first person's practice, or its
         * report would be saved under the wrong account (login.md H6).
         */
        fun returnsToPage(returnBack: Boolean, expiredAccount: String?, signedIn: String?): Boolean =
            returnBack && expiredAccount != null && expiredAccount == signedIn

        /**
         * The code's digits: ASCII 0–9 only, full-width ０–９ (Chinese keyboards) turned into
         * them, everything else dropped. Not isDigit(): that accepts other scripts' digits too.
         */
        fun codeDigits(input: String): String = buildString {
            input.forEach { c ->
                when (c) {
                    in '0'..'9' -> append(c)
                    in '０'..'９' -> append('0' + (c - '０'))
                }
            }
        }

        /** Invite codes: dashes and spaces optional, not case-sensitive (login.md L3). */
        fun normalizeInvite(code: String): String = code.filterNot { it == '-' || it.isWhitespace() }.lowercase()
    }
}
