package io.novawerk.psygym.data.api

import io.novawerk.psygym.AppConfig
import io.novawerk.psygym.domain.model.ApiLocale
import kotlinx.coroutines.delay

/**
 * Sign-in for demo data, so the login screens work without a server. Debug builds only:
 * building one in a release build throws, and release never builds the demo backend at all
 * (AppComponent), so "any code works" can't ship. FakeAuthReleaseTest pins this.
 *
 * Codes: 000000 is wrong (invalid_code), 999999 acts as no connection; any other 6 digits work.
 * An email we haven't seen needs an invite code: any 12 letters or digits work.
 */
class FakeAuthApi(private val delayMillis: Long = 400) : AuthApi {
    init {
        check(AppConfig.isDebug) { "demo sign-in is for debug builds only" }
    }

    // Emails that already have an account. lin@example.com is an "existing user" for demos.
    private val accounts = mutableSetOf("lin@example.com")
    private var issued = 0

    override suspend fun startSignIn(email: String, locale: ApiLocale) {
        delay(delayMillis)
    }

    override suspend fun verify(email: String, code: String, inviteCode: String?): AuthSession {
        delay(delayMillis)
        when (code) {
            WRONG_CODE -> throw ApiException(ApiErrorCode.InvalidCode)
            OFFLINE_CODE -> throw ApiException(ApiErrorCode.Network)
        }
        val address = email.trim().lowercase()
        if (address !in accounts) {
            if (inviteCode == null) throw ApiException(ApiErrorCode.InviteRequired)
            if (inviteCode.length != 12) throw ApiException(ApiErrorCode.InviteInvalid)
            accounts += address
        }
        issued += 1
        return AuthSession(token = "demo-token-$issued", me = Account(address, inviteBatch = "demo"))
    }

    override suspend fun signOut() {
        delay(delayMillis / 2)
    }

    override suspend fun deleteAccount() {
        delay(delayMillis)
    }

    companion object {
        const val WRONG_CODE = "000000"
        const val OFFLINE_CODE = "999999"
    }
}
