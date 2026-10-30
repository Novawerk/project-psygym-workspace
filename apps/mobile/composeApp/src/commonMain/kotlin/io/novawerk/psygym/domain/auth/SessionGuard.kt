package io.novawerk.psygym.domain.auth

import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.Backend
import io.novawerk.psygym.data.api.needsSignIn
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch

/**
 * Notices when the server refuses the session (session_expired, sign_in_required, 426) on any
 * call and tells [sessions], so the app can send the user to sign in. The error still reaches
 * the caller: the screen keeps what it had (a running session isn't lost).
 */
class SessionGuard(private val inner: Backend, private val sessions: SessionStore) : Backend {
    override suspend fun cases() = guard { inner.cases() }

    override fun chat(request: TurnRequest) = inner.chat(request).guarded()

    override fun supervision(request: TurnRequest) = inner.supervision(request).guarded()

    override suspend fun voiceAvailable() = inner.voiceAvailable()

    override suspend fun voiceSession(caseId: String, locale: ApiLocale) = guard { inner.voiceSession(caseId, locale) }

    override suspend fun startSignIn(email: String, locale: ApiLocale) = inner.startSignIn(email, locale)

    override suspend fun verify(email: String, code: String, inviteCode: String?) = inner.verify(email, code, inviteCode)

    override suspend fun signOut(token: String) = inner.signOut(token)

    override suspend fun deleteAccount() = guard { inner.deleteAccount() }

    private suspend fun <T> guard(block: suspend () -> T): T = try {
        block()
    } catch (e: ApiException) {
        if (e.code.needsSignIn) sessions.markExpired()
        throw e
    }

    private fun <T> Flow<T>.guarded(): Flow<T> = catch { e ->
        if (e is ApiException && e.code.needsSignIn) sessions.markExpired()
        throw e
    }
}
