package io.novawerk.psygym.ui.pages.practice

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.ChatEvent
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.data.api.toError
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.ContractLimits
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import io.novawerk.psygym.domain.practice.PracticeSession
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

enum class EndKind { NotStarted, Short, Normal }

private const val NEAR_LIMIT = 70

/** One bubble. An incomplete reply broke off mid-stream: shown, never sent back. */
data class ChatItem(val message: Message, val incomplete: Boolean = false)

class PracticeViewModel(
    private val api: PsygymApi,
    private val session: PracticeSession,
) : ViewModel() {

    val case = session.case

    var items by mutableStateOf(session.transcript.map { ChatItem(it) })
        private set

    /** True from send until the client's reply ends. Input is disabled meanwhile. */
    var streaming by mutableStateOf(false)
        private set

    var error by mutableStateOf<ApiError?>(null)
        private set

    /** The client ended the session (`session_end`): input locked, only "End" remains. */
    var clientEnded by mutableStateOf(session.clientEnded)
        private set

    private var job: Job? = null

    init {
        // A new session starts when this screen opens; the clock starts here.
        if (session.case != null && session.startedAt == null) session.begin()
    }

    val turns: Int get() = transcript.count { it.role == Role.Counselor }

    /** Which end-of-session sheet to show (screens.md S2). */
    val endKind: EndKind
        get() = when {
            clientEnded -> EndKind.Normal
            transcript.none { it.role == Role.Client && it.text.isNotBlank() } -> EndKind.NotStarted
            turns <= 2 -> EndKind.Short
            else -> EndKind.Normal
        }

    /** What the server sees: complete messages only. */
    private val transcript: List<Message> get() = items.filterNot { it.incomplete }.map { it.message }

    /** No room for one more counselor message and the client's reply. */
    val atLimit: Boolean get() = transcript.size > ContractLimits.MAX_MESSAGES - 2

    /** From the 70th message on (screens.md S1). */
    val nearLimit: Boolean get() = transcript.size >= NEAR_LIMIT && !atLimit

    val canSend: Boolean get() = case != null && !streaming && !atLimit && !clientEnded

    val canEnd: Boolean get() = !streaming && transcript.any { it.role == Role.Client && it.text.isNotBlank() }

    fun send(text: String, locale: ApiLocale) {
        val trimmed = text.trim().take(ContractLimits.MAX_MESSAGE_CHARS)
        if (trimmed.isEmpty() || !canSend) return
        replaceItems(items + ChatItem(Message(Role.Counselor, trimmed)))
        requestReply(locale)
    }

    /** Ask again for the reply that failed: drop the broken half and ask for the whole turn. */
    fun retry(locale: ApiLocale) {
        if (streaming) return
        val kept = items.dropLastWhile { it.incomplete }
        if (kept.lastOrNull()?.message?.role != Role.Counselor) return
        replaceItems(kept)
        requestReply(locale)
    }

    private fun requestReply(locale: ApiLocale) {
        val caseId = case?.id ?: return
        val before = items
        val request = TurnRequest(caseId, locale, transcript)
        error = null
        streaming = true
        job?.cancel()
        job = viewModelScope.launch {
            val reply = StringBuilder()
            try {
                api.chat(request).collect { event ->
                    when (event) {
                        is ChatEvent.Delta -> {
                            reply.append(event.text)
                            replaceItems(before + ChatItem(Message(Role.Client, reply.toString())))
                        }
                        ChatEvent.SessionEnd -> {
                            clientEnded = true
                            session.markClientEnded()
                        }
                    }
                }
                if (reply.isEmpty()) error = ApiError(ApiErrorCode.Unknown)
            } catch (e: ApiException) {
                error = e.toError()
                // Keep what already arrived, marked as unfinished (acceptance D4).
                replaceItems(if (reply.isEmpty()) before else before + ChatItem(Message(Role.Client, reply.toString()), incomplete = true))
            } finally {
                streaming = false
            }
        }
    }

    private fun replaceItems(value: List<ChatItem>) {
        items = value
        session.update(transcript)
    }
}
