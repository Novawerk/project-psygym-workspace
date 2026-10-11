package io.novawerk.psygym.domain.history

import io.novawerk.psygym.domain.auth.accountKey
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.LocalizedText
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import kotlinx.coroutines.test.runTest
import okio.Path.Companion.toPath
import okio.fakefilesystem.FakeFileSystem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HistoryRepositoryTest {
    private val fs = FakeFileSystem()
    private val dir = "/app/history".toPath()
    private val case = CaseSummary("c1", "cbt", LocalizedText("甲", "A"), LocalizedText("s", "s"))

    private fun session(id: String, at: Long, complete: Boolean = true) = SavedSession(
        id = id,
        case = case,
        startedAtMillis = at,
        endedAtMillis = at + 600_000,
        messages = listOf(Message(Role.Counselor, "你好"), Message(Role.Client, "嗯")),
        report = if (complete) "## 下次练什么\n\n1. 议程" else "",
        reportComplete = complete,
    )

    private val lin = accountKey("lin@example.com")
    private val jie = accountKey("jie@example.com")

    private suspend fun signedIn(account: String = lin) = HistoryRepository(dir, fs).apply { setOwner(account) }

    @Test
    fun savesUpdatesAndListsNewestFirst() = runTest {
        val repo = signedIn()
        assertEquals(emptyList(), repo.sessions.value)
        repo.save(session("a", 1_000, complete = false))
        repo.save(session("b", 2_000))
        // Same id again: the finished report replaces the unfinished record.
        repo.save(session("a", 1_000, complete = true))
        assertEquals(listOf("b", "a"), repo.sessions.value!!.map { it.id })
        assertTrue(repo.sessions.value!!.all { it.reportComplete })
        assertEquals(1, repo.sessions.value!!.first().turns)

        // A fresh repository reads the same files back.
        val again = signedIn()
        assertEquals(listOf("b", "a"), again.sessions.value!!.map { it.id })
    }

    @Test
    fun deletesOneAndAll() = runTest {
        val repo = signedIn()
        repo.save(session("a", 1_000))
        repo.save(session("b", 2_000))
        repo.delete("a")
        assertEquals(listOf("b"), repo.sessions.value!!.map { it.id })
        repo.deleteAll()
        assertEquals(emptyList(), repo.sessions.value)
        assertEquals(emptyList(), fs.list(dir))
    }

    @Test
    fun diskTroubleIsSkippedNotThrown() = runTest {
        // A plain file where the directory should be: every write fails.
        fs.createDirectories("/app".toPath())
        fs.write(dir) { writeUtf8("not a directory") }
        val repo = signedIn()
        assertEquals(false, repo.save(session("a", 1_000)))
        assertEquals(emptyList(), repo.sessions.value)
        repo.delete("a")
        repo.deleteAll()
    }

    @Test
    fun skipsFilesItCannotRead() = runTest {
        fs.createDirectories(dir)
        fs.write(dir / "broken.json") { writeUtf8("{not json") }
        val repo = signedIn()
        repo.save(session("a", 1_000))
        assertEquals(listOf("a"), repo.sessions.value!!.map { it.id })
    }

    @Test
    fun eachAccountSeesOnlyItsOwnSessions() = runTest {
        val repo = signedIn(lin)
        repo.save(session("a", 1_000))
        repo.setOwner(jie)
        assertEquals(emptyList(), repo.sessions.value)
        repo.save(session("b", 2_000))
        assertEquals(listOf("b"), repo.sessions.value!!.map { it.id })
        // Back to the first account: its session is there again.
        repo.setOwner(lin)
        assertEquals(listOf("a"), repo.sessions.value!!.map { it.id })
        // Signed out: nothing shows, nothing is deleted.
        repo.setOwner(null)
        assertEquals(emptyList(), repo.sessions.value)
        assertEquals(2, fs.list(dir).size)
    }

    @Test
    fun sessionsFromBeforeSignInGoToTheFirstAccount() = runTest {
        // Saved by the version without accounts: no owner.
        fs.createDirectories(dir)
        val old = HistoryRepository(dir, fs)
        fs.write(dir / "old.json") { writeUtf8(kotlinx.serialization.json.Json.encodeToString(SavedSession.serializer(), session("old", 500))) }
        old.setOwner(lin)
        assertEquals(listOf("old"), old.sessions.value!!.map { it.id })
        // Already claimed: the next account doesn't get it.
        old.setOwner(jie)
        assertEquals(emptyList(), old.sessions.value)
    }

    @Test
    fun deletingAnAccountDeletesOnlyItsSessions() = runTest {
        val repo = signedIn(lin)
        repo.save(session("a", 1_000))
        repo.setOwner(jie)
        repo.save(session("b", 2_000))
        repo.deleteAccount(jie)
        assertEquals(emptyList(), repo.sessions.value)
        repo.setOwner(lin)
        assertEquals(listOf("a"), repo.sessions.value!!.map { it.id })
    }

    @Test
    fun filesNeverHoldTheEmail() = runTest {
        val repo = signedIn(accountKey("  Lin@Example.com "))
        repo.save(session("a", 1_000))
        val text = fs.read(dir / "a.json") { readUtf8() }
        assertTrue("example.com" !in text.lowercase())
        // Trimmed and lower-cased first: the same address finds its sessions.
        assertEquals(lin, accountKey("  Lin@Example.com "))
        assertEquals(64, lin.length)
    }
}
