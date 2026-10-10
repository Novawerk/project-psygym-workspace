package io.novawerk.psygym.ui.pages.cases

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.domain.model.CaseSummary
import kotlinx.coroutines.launch

class CasesViewModel(private val api: PsygymApi) : ViewModel() {
    var cases by mutableStateOf<List<CaseSummary>?>(null)
        private set
    var error by mutableStateOf<ApiErrorCode?>(null)
        private set
    var loading by mutableStateOf(false)
        private set

    init {
        load()
    }

    fun load() {
        if (loading) return
        loading = true
        error = null
        viewModelScope.launch {
            try {
                cases = api.cases()
            } catch (e: ApiException) {
                error = e.code
            } finally {
                loading = false
            }
        }
    }
}
