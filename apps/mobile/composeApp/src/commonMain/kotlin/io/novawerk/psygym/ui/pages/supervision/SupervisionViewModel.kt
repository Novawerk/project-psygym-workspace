package io.novawerk.psygym.ui.pages.supervision

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.TurnRequest
import io.novawerk.psygym.domain.practice.PracticeSession
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class SupervisionViewModel(
    private val api: PsygymApi,
    private val session: PracticeSession,
) : ViewModel() {

    var report by mutableStateOf("")
        private set
    var streaming by mutableStateOf(false)
        private set
    var error by mutableStateOf<ApiErrorCode?>(null)
        private set

    private var job: Job? = null
    private var started = false

    /** Called from the screen once it knows the UI language. Runs once per screen. */
    fun start(locale: ApiLocale) {
        if (started) return
        started = true
        load(locale)
    }

    fun load(locale: ApiLocale) {
        val caseId = session.case?.id ?: return
        val request = TurnRequest(caseId, locale, session.transcript)
        report = ""
        error = null
        streaming = true
        job?.cancel()
        job = viewModelScope.launch {
            try {
                api.supervision(request).collect { report += it }
                if (report.isEmpty()) error = ApiErrorCode.Unknown
            } catch (e: ApiException) {
                error = e.code
            } finally {
                streaming = false
            }
        }
    }

    /** The practice is over; nothing is kept. */
    fun finish() {
        job?.cancel()
        session.clear()
    }
}
