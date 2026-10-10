package io.novawerk.psygym.data.api

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.novawerk.psygym.domain.model.ApiLocale
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

// Streaming is tested against a real server in androidUnitTest: MockEngine has no SSE support.
class KtorPsygymApiTest {

    private fun api(engine: MockEngine) = KtorPsygymApi(
        baseUrl = "http://test",
        inviteCode = { "code-1" },
        engineClient = HttpClient(engine),
    )

    private fun json(body: String, status: HttpStatusCode = HttpStatusCode.OK) = MockEngine { req ->
        assertEquals("code-1", req.headers["X-Invite-Code"])
        assertEquals("/cases", req.url.encodedPath)
        respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
    }

    @Test
    fun parsesCases() = runTest {
        val body = """{"cases":[{"id":"a","school":"cbt","title":{"zh":"甲","en":"A"},"summary":{"zh":"s","en":"s"}}]}"""
        val cases = api(json(body)).cases()
        assertEquals("A", cases.single().title.get(ApiLocale.En))
        assertEquals("甲", cases.single().title.get(ApiLocale.Zh))
    }

    @Test
    fun parsesOptionalCaseFieldsAndCopesWithoutThem() = runTest {
        val body = """{"cases":[
            {"id":"a","school":"cbt","title":{"zh":"甲","en":"A"},"summary":{"zh":"s","en":"s"},
             "tags":[{"zh":"抑郁","en":"Depression"}],"difficulty":"medium","estimatedMinutes":20,
             "clientAlias":{"zh":"小林","en":"Lin"},"clientIntro":{"zh":"i","en":"i"},
             "practiceFocus":[{"zh":"建立关系","en":"Rapport"}],"contentNotes":{"zh":"n","en":"n"},
             "somethingNew":true},
            {"id":"b","school":"cbt","title":{"zh":"乙","en":"B"},"summary":{"zh":"s","en":"s"}}
        ]}"""
        val (a, b) = api(json(body)).cases()
        assertEquals("小林", a.clientAlias?.zh)
        assertEquals(io.novawerk.psygym.domain.model.Difficulty.Medium, a.difficulty)
        assertEquals(20, a.estimatedMinutes)
        assertEquals(1, a.practiceFocus.size)
        assertEquals(null, b.clientAlias)
        assertEquals(emptyList(), b.tags)
    }

    @Test
    fun errorBodyCodeWins() = runTest {
        val e = assertFailsWith<ApiException> {
            api(json("""{"error":{"code":"rate_limited","message":"slow"}}""", HttpStatusCode.TooManyRequests)).cases()
        }
        assertEquals(ApiErrorCode.RateLimited, e.code)
    }

    @Test
    fun statusIsTheFallback() = runTest {
        val e = assertFailsWith<ApiException> {
            api(json("not json", HttpStatusCode.ServiceUnavailable)).cases()
        }
        assertEquals(ApiErrorCode.ModelUnavailable, e.code)
    }
}
