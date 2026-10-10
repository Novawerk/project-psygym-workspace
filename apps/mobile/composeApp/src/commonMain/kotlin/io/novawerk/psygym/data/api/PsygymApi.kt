package io.novawerk.psygym.data.api

import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.flow.Flow

/** The app's only way out to the network: our own backend. No model vendor, no keys. */
interface PsygymApi {
    /** `GET /cases`. Throws [ApiException]. */
    suspend fun cases(): List<CaseSummary>

    /** `POST /chat`. Emits the client's reply text in pieces; throws [ApiException]. */
    fun chat(request: TurnRequest): Flow<String>

    /** `POST /supervision`. Emits the Markdown report in pieces; throws [ApiException]. */
    fun supervision(request: TurnRequest): Flow<String>
}

/** Error codes from the contract, plus two the app produces itself. */
enum class ApiErrorCode(val wire: String?) {
    InvalidRequest("invalid_request"),
    InviteRequired("invite_required"),
    CaseNotFound("case_not_found"),
    RateLimited("rate_limited"),
    ModelUnavailable("model_unavailable"),

    /** No connection, timeout, or the stream broke. */
    Network(null),

    /** Anything we don't recognise. */
    Unknown(null),
    ;

    companion object {
        fun fromWire(code: String?): ApiErrorCode = entries.firstOrNull { it.wire != null && it.wire == code } ?: Unknown

        fun fromHttpStatus(status: Int): ApiErrorCode = when (status) {
            400 -> InvalidRequest
            401 -> InviteRequired
            404 -> CaseNotFound
            429 -> RateLimited
            503 -> ModelUnavailable
            else -> Unknown
        }
    }
}

class ApiException(
    val code: ApiErrorCode,
    message: String? = null,
    cause: Throwable? = null,
) : Exception(message ?: code.name, cause)
