package io.novawerk.psygym.data.api

import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow

/** Routes each call to the real backend or to demo data, decided per call. Debug builds only. */
class SwitchingPsygymApi(
    private val real: Backend,
    private val fake: Backend,
    private val useFake: suspend () -> Boolean,
) : Backend {
    override suspend fun cases() = pick().cases()

    override fun chat(request: TurnRequest): Flow<ChatEvent> = flow { emitAll(pick().chat(request)) }

    override fun supervision(request: TurnRequest): Flow<String> = flow { emitAll(pick().supervision(request)) }

    override suspend fun voiceAvailable() = pick().voiceAvailable()

    override suspend fun voiceSession(caseId: String, locale: ApiLocale) = pick().voiceSession(caseId, locale)

    override suspend fun startSignIn(email: String, locale: ApiLocale) = pick().startSignIn(email, locale)

    override suspend fun verify(email: String, code: String, inviteCode: String?) = pick().verify(email, code, inviteCode)

    override suspend fun signOut(token: String) = pick().signOut(token)

    override suspend fun deleteAccount() = pick().deleteAccount()

    private suspend fun pick(): Backend = if (useFake()) fake else real
}
