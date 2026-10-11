package io.novawerk.psygym.data.api

import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.Serializable

/** The app's only way out to the network: our own backend. No model vendor, no keys. */
interface PsygymApi {
    /** `GET /cases`. Throws [ApiException]. */
    suspend fun cases(): List<CaseSummary>

    /** `POST /chat`. Emits the client's reply in pieces, then maybe [ChatEvent.SessionEnd]; throws [ApiException]. */
    fun chat(request: TurnRequest): Flow<ChatEvent>

    /** `POST /supervision`. Emits the Markdown report in pieces; throws [ApiException]. */
    fun supervision(request: TurnRequest): Flow<String>
}

/**
 * Sign-in (docs/api-contract.md "Sign-in", docs/product/login.md): email and a one-time code.
 * Every [PsygymApi] call carries the session token these produce.
 */
interface AuthApi {
    /** `POST /auth/start`: emails a 6-digit code. Always succeeds for a well-formed email. */
    suspend fun startSignIn(email: String, locale: ApiLocale)

    /**
     * `POST /auth/verify`. A new email first gets [ApiErrorCode.InviteRequired] (the code stays
     * valid); then the same code again with [inviteCode].
     */
    suspend fun verify(email: String, code: String, inviteCode: String? = null): AuthSession

    /** `POST /auth/logout`: ends this session on the server. Succeeds for unknown tokens too. */
    suspend fun signOut()

    /** `DELETE /me`: deletes the account on the server. */
    suspend fun deleteAccount()
}

/** The whole backend: what [KtorPsygymApi] and the demo data both provide. */
interface Backend : PsygymApi, AuthApi

@Serializable
data class Account(val email: String, val createdAt: String? = null, val inviteBatch: String? = null)

@Serializable
data class AuthSession(val token: String, val expiresAt: String? = null, val me: Account)

sealed interface ChatEvent {
    data class Delta(val text: String) : ChatEvent

    /** The client ended the session in character (`session_end` frame). Lock the input. */
    data object SessionEnd : ChatEvent
}

/** Error codes from the contract, plus two the app produces itself. */
enum class ApiErrorCode(val wire: String?) {
    InvalidRequest("invalid_request"),
    /** `/auth/verify`: a new email needs an invite code (the code is still good). */
    InviteRequired("invite_required"),

    /** `/auth/verify`: the invite code isn't valid; it used one of the code's tries. */
    InviteInvalid("invite_invalid"),

    /** `/auth/verify`: the code is wrong, expired, used, replaced, or out of tries. */
    InvalidCode("invalid_code"),

    /** No session token where one is needed. */
    SignInRequired("sign_in_required"),

    /** The token is wrong, expired, signed out, or its account was deleted. */
    SessionExpired("session_expired"),

    /** The server needs a token and we sent none (shouldn't happen in this app). */
    UpdateRequired("update_required"),
    CaseNotFound("case_not_found"),
    RateLimited("rate_limited"),
    ModelUnavailable("model_unavailable"),

    /** No connection, or the stream broke off. */
    Network(null),

    /** Nothing arrived for 30 seconds (pings and turn_start count as something). */
    Timeout(null),

    /** Anything we don't recognise. */
    Unknown(null),
    ;

    companion object {
        fun fromWire(code: String?): ApiErrorCode = entries.firstOrNull { it.wire != null && it.wire == code } ?: Unknown

        fun fromHttpStatus(status: Int): ApiErrorCode = when (status) {
            400 -> InvalidRequest
            401 -> SessionExpired
            426 -> UpdateRequired
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
    /** From `Retry-After` on 429, when the server sends whole seconds. */
    val retryAfterSeconds: Int? = null,
) : Exception(message ?: code.name, cause)

/** What the UI keeps of a failure. */
data class ApiError(val code: ApiErrorCode, val retryAfterSeconds: Int? = null)

/** The session is gone: the app signs in again (login.md "其他错误"). */
val ApiErrorCode.needsSignIn: Boolean
    get() = this == ApiErrorCode.SessionExpired || this == ApiErrorCode.SignInRequired || this == ApiErrorCode.UpdateRequired

fun ApiException.toError() = ApiError(code, retryAfterSeconds)
