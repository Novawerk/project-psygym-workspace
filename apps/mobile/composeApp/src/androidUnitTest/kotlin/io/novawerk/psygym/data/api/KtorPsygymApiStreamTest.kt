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
import java.io.OutputStream
import java.net.InetSocketAddress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** The real SSE path: OkHttp engine against a tiny local server that streams like ours. */
class KtorPsygymApiStreamTest {

    private lateinit var server: HttpServer
    private var status = 200
    private var headers = mapOf("Content-Type" to "text/event-stream")
    private var lastRequestBody = ""
    private var lastAuth: String? = null
    private var lastInvite: String? = null

    /** What the server writes after the headers. Frames are flushed one by one. */
    private var script: (Stream) -> Unit = {}

    class Stream(private val out: OutputStream) {
        fun frame(json: String) = raw("data: $json\n\n")
        fun ping() = raw(": ping\n\n")
        fun pause(millis: Long) = Thread.sleep(millis)
        fun raw(text: String) {
            out.write(text.encodeToByteArray())
            out.flush()
        }
    }

    @Before
    fun start() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            lastAuth = exchange.requestHeaders.getFirst("Authorization")
            lastInvite = exchange.requestHeaders.getFirst("X-Invite-Code")
            lastRequestBody = exchange.requestBody.readBytes().decodeToString()
            headers.forEach { (k, v) -> exchange.responseHeaders.add(k, v) }
            // 0 = chunked, like a real SSE response with no Content-Length.
            exchange.sendResponseHeaders(status, 0)
            runCatching { exchange.responseBody.use { script(Stream(it)) } }
        }
        server.executor = java.util.concurrent.Executors.newCachedThreadPool()
        server.start()
    }

    @After
    fun stop() = server.stop(0)

    private fun api(idleTimeoutMillis: Long = 30_000) = KtorPsygymApi(
        baseUrl = "http://127.0.0.1:${server.address.port}",
        token = { "tok-1" },
        engineClient = HttpClient(OkHttp),
        idleTimeoutMillis = idleTimeoutMillis,
    )

    private val request = TurnRequest("demo", ApiLocale.Zh, listOf(Message(Role.Counselor, "你好")))

    @Test
    fun streamsDeltasInOrderAndIgnoresPings() = runBlocking {
        script = {
            it.frame("""{"type":"turn_start"}""")
            it.ping()
            it.frame("""{"type":"text_delta","text":"我"}""")
            it.frame("""{"type":"text_delta","text":"还好"}""")
            it.frame("""{"type":"turn_end","usage":{"inputTokens":1,"outputTokens":2}}""")
        }

        assertEquals(listOf(ChatEvent.Delta("我"), ChatEvent.Delta("还好")), api().chat(request).toList())
        // The session token on every request; never an invite code (contract "Sign-in").
        assertEquals("Bearer tok-1", lastAuth)
        assertEquals(null, lastInvite)
        assertTrue(lastRequestBody.contains("\"caseId\":\"demo\""))
        // durationSec is for /supervision; left out when not set.
        assertTrue("durationSec" !in lastRequestBody)
        assertTrue(lastRequestBody.contains("\"locale\":\"zh\""))
        assertTrue(lastRequestBody.contains("\"role\":\"counselor\""))
    }

    @Test
    fun sessionEndIsReportedAndUnknownFramesIgnored() = runBlocking {
        script = {
            it.frame("""{"type":"turn_start"}""")
            it.frame("""{"type":"text_delta","text":"我想今天先到这里。"}""")
            it.frame("""{"type":"something_new","extra":{"a":1}}""")
            it.frame("""{"type":"session_end"}""")
            it.frame("""{"type":"turn_end"}""")
        }
        assertEquals(
            listOf(ChatEvent.Delta("我想今天先到这里。"), ChatEvent.SessionEnd),
            api().chat(request).toList(),
        )
    }

    @Test
    fun supervisionIgnoresSessionEnd() = runBlocking {
        script = {
            it.frame("""{"type":"text_delta","text":"## 做得好的地方"}""")
            it.frame("""{"type":"session_end"}""")
            it.frame("""{"type":"turn_end"}""")
        }
        assertEquals(listOf("## 做得好的地方"), api().supervision(request).toList())
    }

    @Test
    fun errorFrameEndsTheStream() = runBlocking {
        script = {
            it.frame("""{"type":"turn_start"}""")
            it.frame("""{"type":"text_delta","text":"部分"}""")
            it.frame("""{"type":"error","code":"model_unavailable","message":"down"}""")
        }
        val e = assertFailsWith<ApiException> { api().supervision(request).toList() }
        assertEquals(ApiErrorCode.ModelUnavailable, e.code)
    }

    @Test
    fun streamWithoutTurnEndIsANetworkError() = runBlocking {
        script = {
            it.frame("""{"type":"turn_start"}""")
            it.frame("""{"type":"text_delta","text":"说到一半"}""")
        }
        val e = assertFailsWith<ApiException> { api().chat(request).toList() }
        assertEquals(ApiErrorCode.Network, e.code)
    }

    @Test
    fun silenceLongerThanTheIdleTimeoutIsATimeout() = runBlocking {
        script = {
            it.frame("""{"type":"turn_start"}""")
            it.pause(1_500)
            it.frame("""{"type":"turn_end"}""")
        }
        val e = assertFailsWith<ApiException> { api(idleTimeoutMillis = 500).chat(request).toList() }
        assertEquals(ApiErrorCode.Timeout, e.code)
    }

    @Test
    fun pingsKeepASlowStreamAlive() = runBlocking {
        script = {
            it.frame("""{"type":"turn_start"}""")
            repeat(5) { _ ->
                it.pause(250)
                it.ping()
            }
            it.frame("""{"type":"text_delta","text":"慢"}""")
            it.frame("""{"type":"turn_end"}""")
        }
        // 1.25 s in total, never more than 0.25 s of silence.
        assertEquals(listOf("慢"), api(idleTimeoutMillis = 500).supervision(request).toList())
    }

    @Test
    fun errorsBeforeTheStreamMapToCodes() = runBlocking {
        headers = mapOf("Content-Type" to "application/json")
        val cases = mapOf(
            400 to ("invalid_request" to ApiErrorCode.InvalidRequest),
            401 to ("session_expired" to ApiErrorCode.SessionExpired),
            426 to ("update_required" to ApiErrorCode.UpdateRequired),
            404 to ("case_not_found" to ApiErrorCode.CaseNotFound),
            429 to ("rate_limited" to ApiErrorCode.RateLimited),
            503 to ("model_unavailable" to ApiErrorCode.ModelUnavailable),
        )
        for ((httpStatus, pair) in cases) {
            status = httpStatus
            script = { it.raw("""{"error":{"code":"${pair.first}","message":"x"}}""") }
            val e = assertFailsWith<ApiException> { api().chat(request).toList() }
            assertEquals(pair.second, e.code, "HTTP $httpStatus")
        }
    }

    @Test
    fun rateLimitedCarriesRetryAfter() = runBlocking {
        status = 429
        headers = mapOf("Content-Type" to "application/json", "Retry-After" to "42")
        script = { it.raw("""{"error":{"code":"rate_limited","message":"x"}}""") }
        val e = assertFailsWith<ApiException> { api().chat(request).toList() }
        assertEquals(ApiErrorCode.RateLimited, e.code)
        assertEquals(42, e.retryAfterSeconds)
    }

    @Test
    fun noServerIsANetworkError() = runBlocking {
        server.stop(0)
        val e = assertFailsWith<ApiException> { api().chat(request).toList() }
        assertEquals(ApiErrorCode.Network, e.code)
    }

    @Test
    fun supervisionSendsTheSessionLength() = runBlocking {
        script = {
            it.frame("""{"type":"text_delta","text":"报告"}""")
            it.frame("""{"type":"turn_end"}""")
        }
        api().supervision(request.copy(durationSec = 754)).toList()
        assertTrue(lastRequestBody.contains("\"durationSec\":754"), lastRequestBody)
        // The full report never says a mode (the server's default is "final").
        assertTrue("mode" !in lastRequestBody, lastRequestBody)
    }

    @Test
    fun liveNotesAskWithModeLive() = runBlocking {
        script = {
            it.frame("""{"type":"text_delta","text":"- 提示"}""")
            it.frame("""{"type":"turn_end"}""")
        }
        api().supervision(request.copy(mode = "live")).toList()
        assertTrue(lastRequestBody.contains("\"mode\":\"live\""), lastRequestBody)
        assertTrue("durationSec" !in lastRequestBody)
    }
}
