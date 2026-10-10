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
import io.ktor.client.request.get
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
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.CasesResponse
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.timeout
import kotlinx.coroutines.flow.transformWhile
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Duration.Companion.milliseconds

/**
 * Talks to `apps/api` as described in docs/api-contract.md.
 *
 * [inviteCode] is read on every request so a code saved in Settings takes effect at once.
 * [idleTimeoutMillis] is how long we wait for any byte: `: ping` comments arrive every
 * ~15 s, so a slow supervision report doesn't trip it (acceptance D7).
 */
class KtorPsygymApi(
    private val baseUrl: String,
    private val inviteCode: suspend () -> String,
    engineClient: HttpClient = HttpClient(),
    private val idleTimeoutMillis: Long = 30_000,
) : PsygymApi {

    private val json = Json { ignoreUnknownKeys = true }

    private val client = engineClient.config {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
        // Comment events too: a `: ping` must reset the idle timer.
        install(SSE) { showCommentEvents() }
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            // Covers the wait for response headers. Once events flow, Flow.timeout below
            // decides: engines report a read timeout mid-stream inconsistently.
            socketTimeoutMillis = idleTimeoutMillis
        }
        defaultRequest { url(baseUrl.trimEnd('/') + "/") }
    }

    override suspend fun cases(): List<CaseSummary> = mapErrors {
        val response = client.get("cases") { header(INVITE_HEADER, inviteCode()) }
        if (!response.status.isSuccess()) throw response.toApiException()
        response.body<CasesResponse>().cases
    }

    override fun chat(request: TurnRequest): Flow<String> = stream("chat", request)

    override fun supervision(request: TurnRequest): Flow<String> = stream("supervision", request)

    @OptIn(FlowPreview::class)
    private fun stream(path: String, request: TurnRequest): Flow<String> = channelFlow {
        val code = inviteCode()
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
                        header(INVITE_HEADER, code)
                        setBody(TextContent(json.encodeToString(TurnRequest.serializer(), request), ContentType.Application.Json))
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
                                    frame.text?.let { emit(it) }
                                    true
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
    private data class ErrorBody(val error: ErrorDetail? = null)

    @Serializable
    private data class ErrorDetail(val code: String? = null, val message: String? = null)

    private companion object {
        const val INVITE_HEADER = "X-Invite-Code"
    }
}
