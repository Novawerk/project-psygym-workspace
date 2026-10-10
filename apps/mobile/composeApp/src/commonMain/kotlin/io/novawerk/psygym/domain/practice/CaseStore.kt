package io.novawerk.psygym.domain.practice

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.data.api.toError
import io.novawerk.psygym.domain.model.CaseSummary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The case list, shared by Home (H1) and the case library (C1).
 *
 * The store owns its request, in its own app-wide [scope]: screens only ask. A forced load
 * (new invite code, demo data switched) cancels the request in flight and starts over, so
 * a screen's effect being cancelled can never leave the list stuck loading.
 */
class CaseStore(
    private val api: PsygymApi,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    var cases by mutableStateOf<List<CaseSummary>?>(null)
        private set
    var error by mutableStateOf<ApiError?>(null)
        private set
    var loading by mutableStateOf(false)
        private set

    private var job: Job? = null

    /** Bumped by every request; only the newest may write state. */
    private var generation = 0

    /** Loads unless we have the list or a request is running. [force] always starts over. */
    fun load(force: Boolean = false) {
        if (!force && (cases != null || job?.isActive == true)) return
        job?.cancel()
        val mine = ++generation
        loading = true
        error = null
        if (force) cases = null
        job = scope.launch {
            try {
                val result = api.cases()
                if (mine == generation) cases = result
            } catch (e: ApiException) {
                if (mine == generation) error = e.toError()
            } finally {
                // A cancelled, older request must not end the newer one's loading.
                if (mine == generation) loading = false
            }
        }
    }
}
