package io.novawerk.psygym.data.api

import com.sun.net.httpserver.HttpServer
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import java.net.InetSocketAddress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** The real SSE path: OkHttp engine against a tiny local server. */
class KtorPsygymApiStreamTest {

    private lateinit var server: HttpServer
    private var status = 200
    private var contentType = "text/event-stream"
    private var body = ""
    private var lastRequestBody = ""
    private var lastInvite: String? = null

    @Before
    fun start() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            lastInvite = exchange.requestHeaders.getFirst("X-Invite-Code")
            lastRequestBody = exchange.requestBody.readBytes().decodeToString()
            val bytes = body.encodeToByteArray()
            exchange.responseHeaders.add("Content-Type", contentType)
            // 0 = chunked, like a real SSE response with no Content-Length.
            exchange.sendResponseHeaders(status, if (contentType == "text/event-stream") 0 else bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
    }

    @After
    fun stop() = server.stop(0)

    private fun api() = KtorPsygymApi(
        baseUrl = "http://127.0.0.1:${server.address.port}",
        inviteCode = { "code-1" },
        engineClient = HttpClient(OkHttp),
    )

    private val request = TurnRequest("demo", ApiLocale.Zh, listOf(Message(Role.Counselor, "你好")))

    @Test
    fun streamsDeltasInOrderAndIgnoresPings() = runBlocking {
        body = listOf(
            """data: {"type":"turn_start"}""",
            ": ping",
            """data: {"type":"text_delta","text":"我"}""",
            """data: {"type":"text_delta","text":"还好"}""",
            """data: {"type":"turn_end","usage":{"inputTokens":1,"outputTokens":2}}""",
        ).joinToString("\n\n", postfix = "\n\n")

        assertEquals(listOf("我", "还好"), api().chat(request).toList())
        assertEquals("code-1", lastInvite)
        assertTrue(lastRequestBody.contains("\"caseId\":\"demo\""))
        assertTrue(lastRequestBody.contains("\"locale\":\"zh\""))
        assertTrue(lastRequestBody.contains("\"role\":\"counselor\""))
    }

    @Test
    fun errorFrameEndsTheStream() = runBlocking {
        body = listOf(
            """data: {"type":"turn_start"}""",
            """data: {"type":"text_delta","text":"部分"}""",
            """data: {"type":"error","code":"model_unavailable","message":"down"}""",
        ).joinToString("\n\n", postfix = "\n\n")

        val e = assertFailsWith<ApiException> { api().supervision(request).toList() }
        assertEquals(ApiErrorCode.ModelUnavailable, e.code)
    }

    @Test
    fun errorsBeforeTheStreamMapToCodes() = runBlocking {
        contentType = "application/json"
        val cases = mapOf(
            400 to ("invalid_request" to ApiErrorCode.InvalidRequest),
            401 to ("invite_required" to ApiErrorCode.InviteRequired),
            404 to ("case_not_found" to ApiErrorCode.CaseNotFound),
            429 to ("rate_limited" to ApiErrorCode.RateLimited),
            503 to ("model_unavailable" to ApiErrorCode.ModelUnavailable),
        )
        for ((httpStatus, pair) in cases) {
            status = httpStatus
            body = """{"error":{"code":"${pair.first}","message":"x"}}"""
            val e = assertFailsWith<ApiException> { api().chat(request).toList() }
            assertEquals(pair.second, e.code, "HTTP $httpStatus")
        }
    }

    @Test
    fun noServerIsANetworkError() = runBlocking {
        server.stop(0)
        val e = assertFailsWith<ApiException> { api().chat(request).toList() }
        assertEquals(ApiErrorCode.Network, e.code)
    }
}
