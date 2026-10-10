package io.novawerk.psygym.data.api

import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow

/** Routes each call to the real backend or to demo data, decided per call. */
class SwitchingPsygymApi(
    private val real: PsygymApi,
    private val fake: PsygymApi,
    private val useFake: suspend () -> Boolean,
) : PsygymApi {
    override suspend fun cases() = pick().cases()

    override fun chat(request: TurnRequest): Flow<ChatEvent> = flow { emitAll(pick().chat(request)) }

    override fun supervision(request: TurnRequest): Flow<String> = flow { emitAll(pick().supervision(request)) }

    private suspend fun pick(): PsygymApi = if (useFake()) fake else real
}
