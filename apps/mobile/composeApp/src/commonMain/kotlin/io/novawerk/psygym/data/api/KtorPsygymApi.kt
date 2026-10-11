package io.novawerk.psygym.data.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.network.sockets.SocketTimeoutException
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.sse.SSE
import io.ktor.client.plugins.sse.SSEClientException
import io.ktor.client.plugins.sse.sse
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.header
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.content.TextContent
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.CasesResponse
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.timeout
import kotlinx.coroutines.flow.transform
import kotlinx.coroutines.flow.transformWhile
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Duration.Companion.milliseconds

/**
 * Talks to `apps/api` as described in docs/api-contract.md.
 *
 * [token] is the session token, read on every request; sent as `Authorization: Bearer`. The
 * app always signs in, so it never sends an invite code header (contract "Sign-in").
 * [idleTimeoutMillis] is how long we wait for any byte: `: ping` comments arrive every
 * ~15 s, so a slow supervision report doesn't trip it (acceptance D7).
 */
class KtorPsygymApi(
    private val baseUrl: String,
    private val token: suspend () -> String?,
    engineClient: HttpClient = HttpClient(),
    private val idleTimeoutMillis: Long = 30_000,
) : Backend {

    // explicitNulls = false: optional fields we don't set (durationSec) are left out.
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private val client = engineClient.config {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
        // Comment events too: a `: ping` must reset the idle timer.
        install(SSE) { showCommentEvents() }
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            // A backstop for the wait for response headers. Mid-stream, Flow.timeout below
            // decides; the margin keeps the two from racing (engines report a read timeout
            // mid-stream inconsistently, sometimes as a clean end).
            socketTimeoutMillis = idleTimeoutMillis + SOCKET_TIMEOUT_MARGIN_MILLIS
        }
        defaultRequest { url(baseUrl.trimEnd('/') + "/") }
    }

    override suspend fun cases(): List<CaseSummary> = mapErrors {
        val bearer = token()
        val response = client.get("cases") { auth(bearer) }
        if (!response.status.isSuccess()) throw response.toApiException()
        response.body<CasesResponse>().cases
    }

    override suspend fun startSignIn(email: String, locale: ApiLocale) = mapErrors {
        val response = client.post("auth/start") { jsonBody(StartBody.serializer(), StartBody(email, locale)) }
        if (!response.status.isSuccess()) throw response.toApiException()
    }

    override suspend fun verify(email: String, code: String, inviteCode: String?): AuthSession = mapErrors {
        val response = client.post("auth/verify") { jsonBody(VerifyBody.serializer(), VerifyBody(email, code, inviteCode)) }
        if (!response.status.isSuccess()) throw response.toApiException()
        json.decodeFromString(AuthSession.serializer(), response.bodyAsText())
    }

    override suspend fun signOut() = mapErrors {
        val bearer = token() ?: return@mapErrors
        val response = client.post("auth/logout") { auth(bearer) }
        if (!response.status.isSuccess()) throw response.toApiException()
    }

    override suspend fun deleteAccount() = mapErrors {
        val bearer = token()
        val response = client.delete("me") { auth(bearer) }
        if (!response.status.isSuccess()) throw response.toApiException()
    }

    private fun HttpRequestBuilder.auth(bearer: String?) {
        if (bearer != null) header(HttpHeaders.Authorization, "Bearer $bearer")
    }

    private fun <T> HttpRequestBuilder.jsonBody(serializer: KSerializer<T>, body: T) {
        setBody(TextContent(json.encodeToString(serializer, body), ContentType.Application.Json))
    }

    override fun chat(request: TurnRequest): Flow<ChatEvent> = stream("chat", request)

    override fun supervision(request: TurnRequest): Flow<String> =
        stream("supervision", request).transform { if (it is ChatEvent.Delta) emit(it.text) }

    @OptIn(FlowPreview::class)
    private fun stream(path: String, request: TurnRequest): Flow<ChatEvent> = channelFlow {
        val bearer = token()
        // How the stream ended. An error frame is thrown after the SSE block closes:
        // thrown inside, the connection teardown would replace it with a transport error.
        var ended = false
        var frameError: ApiException? = null
        mapErrors {
            try {
                client.sse(
                    urlString = path,
                    request = {
                        method = HttpMethod.Post
                        auth(bearer)
                        jsonBody(TurnRequest.serializer(), request)
                    },
                ) {
                    incoming
                        .timeout(idleTimeoutMillis.milliseconds)
                        .transformWhile { event ->
                            val data = event.data
                            // `: ping` comments and frames without data carry nothing for us.
                            if (data.isNullOrBlank()) return@transformWhile true
                            val frame = json.decodeFromString(StreamFrame.serializer(), data)
                            when (frame.type) {
                                "text_delta" -> {
                                    frame.text?.let { emit(ChatEvent.Delta(it)) }
                                    true
                                }
                                "session_end" -> {
                                    emit(ChatEvent.SessionEnd)
                                    true // turn_end still follows
                                }
                                "turn_end" -> {
                                    ended = true
                                    false
                                }
                                "error" -> {
                                    frameError = ApiException(ApiErrorCode.fromWire(frame.code), frame.message)
                                    false
                                }
                                else -> true // turn_start and anything new
                            }
                        }
                        .collect { send(it) }
                }
            } catch (e: TimeoutCancellationException) {
                throw e
            } catch (e: Exception) {
                frameError?.let { throw it }
                throw e
            }
            frameError?.let { throw it }
            // The contract ends every stream with turn_end or error. Anything else broke off.
            if (!ended) throw ApiException(ApiErrorCode.Network, "stream ended without turn_end")
        }
    }

    private suspend fun <T> mapErrors(block: suspend () -> T): T = try {
        block()
    } catch (e: TimeoutCancellationException) {
        throw ApiException(ApiErrorCode.Timeout, e.message, e)
    } catch (e: CancellationException) {
        if (e is HttpRequestTimeoutException) throw ApiException(ApiErrorCode.Timeout, e.message, e)
        throw e
    } catch (e: ApiException) {
        throw e
    } catch (e: Exception) {
        val response = (e as? SSEClientException)?.response
        when {
            // Non-2xx (or not an event stream) before the stream started.
            response != null && !response.status.isSuccess() -> throw response.toApiException()
            e.isIdleTimeout() -> throw ApiException(ApiErrorCode.Timeout, e.message, e)
            else -> throw ApiException(ApiErrorCode.Network, e.message, e)
        }
    }

    private fun Throwable.isIdleTimeout(): Boolean = generateSequence(this) { it.cause }.any {
        it is SocketTimeoutException || it is HttpRequestTimeoutException
    }

    private suspend fun HttpResponse.toApiException(): ApiException {
        val body = runCatching { json.decodeFromString(ErrorBody.serializer(), bodyAsText()) }.getOrNull()
        val code = body?.error?.code?.let(ApiErrorCode::fromWire)
            ?.takeIf { it != ApiErrorCode.Unknown }
            ?: ApiErrorCode.fromHttpStatus(status.value)
        val retryAfter = headers[HttpHeaders.RetryAfter]?.trim()?.toIntOrNull()?.takeIf { it > 0 }
        return ApiException(code, body?.error?.message, retryAfterSeconds = retryAfter)
    }

    @Serializable
    private data class StreamFrame(
        val type: String,
        val text: String? = null,
        val code: String? = null,
        val message: String? = null,
    )

    @Serializable
    private data class StartBody(val email: String, val locale: ApiLocale)

    @Serializable
    private data class VerifyBody(val email: String, val code: String, val inviteCode: String? = null)

    @Serializable
    private data class ErrorBody(val error: ErrorDetail? = null)

    @Serializable
    private data class ErrorDetail(val code: String? = null, val message: String? = null)

    private companion object {
        const val SOCKET_TIMEOUT_MARGIN_MILLIS = 5_000L
    }
}
