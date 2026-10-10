package io.novawerk.psygym.domain.history

import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.Message
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okio.FileSystem
import okio.Path

/**
 * One finished session as kept on the phone (docs/decisions/0005). [report] is empty and
 * [reportComplete] false until the supervision finishes.
 */
@Serializable
data class SavedSession(
    val id: String,
    val case: CaseSummary,
    val startedAtMillis: Long,
    val endedAtMillis: Long,
    val messages: List<Message>,
    val report: String = "",
    val reportComplete: Boolean = false,
) {
    val turns: Int get() = messages.count { it.role == io.novawerk.psygym.domain.model.Role.Counselor }
    val durationMillis: Long get() = (endedAtMillis - startedAtMillis).coerceAtLeast(0)
}

/**
 * Practice history on this phone: one JSON file per session in the app's private
 * directory. Not uploaded, not synced, not encrypted (decision 0005 leaves encryption
 * open). Android: allowBackup=false. iOS: Application Support, excluded from backup.
 */
class HistoryRepository(
    private val dir: Path,
    private val fileSystem: FileSystem = FileSystem.SYSTEM,
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val mutex = Mutex()
    private val _sessions = MutableStateFlow<List<SavedSession>?>(null)

    /** Newest first. Null until the first [load]. */
    val sessions: StateFlow<List<SavedSession>?> = _sessions.asStateFlow()

    // Disk trouble (full, unreadable) never crashes the app: a save that fails is skipped,
    // a list that can't be read is empty. History is a convenience, not the practice itself.

    suspend fun load() = mutex.withLock { _sessions.value = readAll() }

    /** Returns false when the file couldn't be written. */
    suspend fun save(session: SavedSession): Boolean = mutex.withLock {
        val ok = io {
            fileSystem.createDirectories(dir)
            fileSystem.write(file(session.id)) { writeUtf8(json.encodeToString(SavedSession.serializer(), session)) }
        } != null
        _sessions.value = readAll()
        ok
    }

    suspend fun delete(id: String) = mutex.withLock {
        io { fileSystem.delete(file(id), mustExist = false) }
        _sessions.value = readAll()
    }

    suspend fun deleteAll() = mutex.withLock {
        io { fileSystem.deleteRecursively(dir, mustExist = false) }
        _sessions.value = readAll()
    }

    fun find(id: String): SavedSession? = _sessions.value?.firstOrNull { it.id == id }

    private suspend fun readAll(): List<SavedSession> = io {
        if (!fileSystem.exists(dir)) return@io emptyList<SavedSession>()
        fileSystem.list(dir)
            .filter { it.name.endsWith(SUFFIX) }
            .mapNotNull { path ->
                // A file we can't read is skipped, not fatal.
                runCatching { json.decodeFromString(SavedSession.serializer(), fileSystem.read(path) { readUtf8() }) }.getOrNull()
            }
            .sortedByDescending { it.startedAtMillis }
    } ?: emptyList()

    private fun file(id: String): Path = dir / "$id$SUFFIX"

    /** Runs file IO off the main thread; null when it failed. */
    private suspend fun <T> io(block: () -> T): T? = withContext(Dispatchers.IO) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    private companion object {
        const val SUFFIX = ".json"
    }
}
