package io.novawerk.psygym.ui.pages.practice

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.ContractLimits
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import io.novawerk.psygym.domain.practice.PracticeSession
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class PracticeViewModel(
    private val api: PsygymApi,
    private val session: PracticeSession,
) : ViewModel() {

    val case = session.case

    var messages by mutableStateOf(session.transcript)
        private set

    /** True from send until the client's reply ends. Input is disabled meanwhile. */
    var streaming by mutableStateOf(false)
        private set

    var error by mutableStateOf<ApiErrorCode?>(null)
        private set

    private var job: Job? = null

    /** Room left for one more counselor message and the client's reply. */
    val atLimit: Boolean get() = messages.size > ContractLimits.MAX_MESSAGES - 2

    val canSend: Boolean get() = case != null && !streaming && !atLimit

    val canEnd: Boolean get() = !streaming && messages.any { it.role == Role.Client && it.text.isNotBlank() }

    fun send(text: String, locale: ApiLocale) {
        val trimmed = text.trim().take(ContractLimits.MAX_MESSAGE_CHARS)
        if (trimmed.isEmpty() || !canSend) return
        replaceMessages(messages + Message(Role.Counselor, trimmed))
        requestReply(locale)
    }

    /** Ask again for the reply that failed. The last message is still the counselor's. */
    fun retry(locale: ApiLocale) {
        if (streaming || messages.lastOrNull()?.role != Role.Counselor) return
        requestReply(locale)
    }

    private fun requestReply(locale: ApiLocale) {
        val caseId = case?.id ?: return
        val request = TurnRequest(caseId, locale, messages)
        error = null
        streaming = true
        job?.cancel()
        job = viewModelScope.launch {
            val reply = StringBuilder()
            try {
                api.chat(request).collect { delta ->
                    reply.append(delta)
                    showReply(request.messages, reply.toString())
                }
                if (reply.isEmpty()) error = ApiErrorCode.Unknown
            } catch (e: ApiException) {
                error = e.code
                // Drop the half reply; Try again asks for the whole turn.
                replaceMessages(request.messages)
            } finally {
                streaming = false
            }
        }
    }

    private fun showReply(before: List<Message>, text: String) {
        replaceMessages(before + Message(Role.Client, text))
    }

    private fun replaceMessages(value: List<Message>) {
        messages = value
        session.update(value)
    }
}
