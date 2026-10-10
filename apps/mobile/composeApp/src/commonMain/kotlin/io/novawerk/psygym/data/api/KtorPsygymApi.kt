package io.novawerk.psygym.data.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
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
import io.ktor.http.HttpMethod
import io.ktor.http.content.TextContent
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.CasesResponse
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.transformWhile
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Talks to `apps/api` as described in docs/api-contract.md.
 *
 * [inviteCode] is read on every request so a code saved in Settings takes effect at once.
 */
class KtorPsygymApi(
    private val baseUrl: String,
    private val inviteCode: suspend () -> String,
    engineClient: HttpClient = HttpClient(),
) : PsygymApi {

    private val json = Json { ignoreUnknownKeys = true }

    private val client = engineClient.config {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
        install(SSE)
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            // Streams can be quiet for a while; the server pings every ~15 s.
            socketTimeoutMillis = 60_000
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

    private fun stream(path: String, request: TurnRequest): Flow<String> = channelFlow {
        val code = inviteCode()
        // An error frame is kept here and thrown after the SSE block closes. Throwing inside
        // the block lets the connection teardown replace it with a transport error.
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
                                "turn_end" -> false
                                "error" -> {
                                    frameError = ApiException(ApiErrorCode.fromWire(frame.code), frame.message)
                                    false
                                }
                                else -> true // turn_start and anything new
                            }
                        }
                        .collect { send(it) }
                }
            } catch (e: Exception) {
                frameError?.let { throw it }
                throw e
            }
            frameError?.let { throw it }
        }
    }

    private suspend fun <T> mapErrors(block: suspend () -> T): T = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: ApiException) {
        throw e
    } catch (e: Exception) {
        val response = (e as? SSEClientException)?.response
        // Non-2xx (or not an event stream) before the stream started.
        if (response != null && !response.status.isSuccess()) throw response.toApiException()
        throw ApiException(ApiErrorCode.Network, e.message, e)
    }

    private suspend fun HttpResponse.toApiException(): ApiException {
        val body = runCatching { json.decodeFromString(ErrorBody.serializer(), bodyAsText()) }.getOrNull()
        val code = body?.error?.code?.let(ApiErrorCode::fromWire)
            ?.takeIf { it != ApiErrorCode.Unknown }
            ?: ApiErrorCode.fromHttpStatus(status.value)
        return ApiException(code, body?.error?.message)
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
