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
        token = { "tok-1" },
        engineClient = HttpClient(engine),
    )

    private fun json(body: String, status: HttpStatusCode = HttpStatusCode.OK) = MockEngine { req ->
        assertEquals("Bearer tok-1", req.headers[HttpHeaders.Authorization])
        assertEquals(null, req.headers["X-Invite-Code"])
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

    private class Seen {
        var path = ""
        var method = ""
        var body = ""
        var auth: String? = null
    }

    private fun auth(status: HttpStatusCode, body: String = "", seen: Seen = Seen()) = MockEngine { req ->
        seen.path = req.url.encodedPath
        seen.method = req.method.value
        seen.auth = req.headers[HttpHeaders.Authorization]
        seen.body = (req.body as? io.ktor.http.content.TextContent)?.text.orEmpty()
        respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
    }

    @Test
    fun startSignInPostsEmailAndLocale() = runTest {
        val seen = Seen()
        api(auth(HttpStatusCode.Accepted, seen = seen)).startSignIn("lin@example.com", ApiLocale.Zh)
        assertEquals("/auth/start", seen.path)
        assertEquals("POST", seen.method)
        assertEquals("""{"email":"lin@example.com","locale":"zh"}""", seen.body)
    }

    @Test
    fun verifyReturnsTheSessionAndLeavesOutAMissingInviteCode() = runTest {
        val seen = Seen()
        val body = """{"token":"t9","expiresAt":"2027-01-01T00:00:00Z","me":{"email":"lin@example.com","createdAt":"2026-10-11T00:00:00Z","inviteBatch":null}}"""
        val session = api(auth(HttpStatusCode.OK, body, seen)).verify("lin@example.com", "123456")
        assertEquals("t9", session.token)
        assertEquals("lin@example.com", session.me.email)
        assertEquals("/auth/verify", seen.path)
        assertEquals("""{"email":"lin@example.com","code":"123456"}""", seen.body)
        // With an invite code (L3, or the one an old install kept).
        api(auth(HttpStatusCode.OK, body, seen)).verify("lin@example.com", "123456", "k7mpx2qr9wtd")
        assertEquals("""{"email":"lin@example.com","code":"123456","inviteCode":"k7mpx2qr9wtd"}""", seen.body)
    }

    @Test
    fun verifyErrorsMapToCodes() = runTest {
        val cases = mapOf(
            "invalid_code" to (HttpStatusCode.BadRequest to ApiErrorCode.InvalidCode),
            "invite_required" to (HttpStatusCode.Forbidden to ApiErrorCode.InviteRequired),
            "invite_invalid" to (HttpStatusCode.Forbidden to ApiErrorCode.InviteInvalid),
        )
        for ((wire, pair) in cases) {
            val e = assertFailsWith<ApiException> {
                api(auth(pair.first, """{"error":{"code":"$wire","message":"x"}}""")).verify("a@b.co", "123456")
            }
            assertEquals(pair.second, e.code, wire)
        }
    }

    @Test
    fun signOutAndDeleteCarryTheToken() = runTest {
        val seen = Seen()
        api(auth(HttpStatusCode.NoContent, seen = seen)).signOut()
        assertEquals("/auth/logout" to "Bearer tok-1", seen.path to seen.auth)
        api(auth(HttpStatusCode.NoContent, seen = seen)).deleteAccount()
        assertEquals("/me" to "DELETE", seen.path to seen.method)
        assertEquals("Bearer tok-1", seen.auth)
        val e = assertFailsWith<ApiException> {
            api(auth(HttpStatusCode.Unauthorized, """{"error":{"code":"session_expired","message":"x"}}""")).deleteAccount()
        }
        assertEquals(ApiErrorCode.SessionExpired, e.code)
    }
}
