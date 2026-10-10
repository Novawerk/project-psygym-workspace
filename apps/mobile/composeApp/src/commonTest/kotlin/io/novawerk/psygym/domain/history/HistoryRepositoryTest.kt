package io.novawerk.psygym.domain.history

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

    @Test
    fun savesUpdatesAndListsNewestFirst() = runTest {
        val repo = HistoryRepository(dir, fs)
        repo.load()
        assertEquals(emptyList(), repo.sessions.value)
        repo.save(session("a", 1_000, complete = false))
        repo.save(session("b", 2_000))
        // Same id again: the finished report replaces the unfinished record.
        repo.save(session("a", 1_000, complete = true))
        assertEquals(listOf("b", "a"), repo.sessions.value!!.map { it.id })
        assertTrue(repo.sessions.value!!.all { it.reportComplete })
        assertEquals(1, repo.sessions.value!!.first().turns)

        // A fresh repository reads the same files back.
        val again = HistoryRepository(dir, fs).apply { load() }
        assertEquals(listOf("b", "a"), again.sessions.value!!.map { it.id })
    }

    @Test
    fun deletesOneAndAll() = runTest {
        val repo = HistoryRepository(dir, fs)
        repo.save(session("a", 1_000))
        repo.save(session("b", 2_000))
        repo.delete("a")
        assertEquals(listOf("b"), repo.sessions.value!!.map { it.id })
        repo.deleteAll()
        assertEquals(emptyList(), repo.sessions.value)
        assertTrue(!fs.exists(dir))
    }

    @Test
    fun skipsFilesItCannotRead() = runTest {
        fs.createDirectories(dir)
        fs.write(dir / "broken.json") { writeUtf8("{not json") }
        val repo = HistoryRepository(dir, fs)
        repo.save(session("a", 1_000))
        assertEquals(listOf("a"), repo.sessions.value!!.map { it.id })
    }
}
