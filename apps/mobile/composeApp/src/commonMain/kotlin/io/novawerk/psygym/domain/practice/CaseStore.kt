package io.novawerk.psygym.domain.practice

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.data.api.toError
import io.novawerk.psygym.di.AppScope
import io.novawerk.psygym.domain.model.CaseSummary
import me.tatarka.inject.annotations.Inject

/** The case list, shared by Home (H1) and the case library (C1). Fetched once per app run. */
@AppScope
@Inject
class CaseStore(private val api: PsygymApi) {
    var cases by mutableStateOf<List<CaseSummary>?>(null)
        private set
    var error by mutableStateOf<ApiError?>(null)
        private set
    var loading by mutableStateOf(false)
        private set

    /** A forced reload asked for while a request was running (e.g. a new invite code). */
    private var reloadPending = false

    /**
     * Loads unless we already have the list. [force] reloads, e.g. after switching demo
     * data or saving an invite code; if a request is already running, it reloads again
     * once that one ends, so the new code is never lost.
     */
    suspend fun load(force: Boolean = false) {
        if (loading) {
            if (force) reloadPending = true
            return
        }
        if (!force && cases != null) return
        loading = true
        error = null
        if (force) cases = null
        try {
            cases = api.cases()
        } catch (e: ApiException) {
            error = e.toError()
        } finally {
            loading = false
        }
        if (reloadPending) {
            reloadPending = false
            load(force = true)
        }
    }
}
