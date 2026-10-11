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
    /** The account it belongs to ([io.novawerk.psygym.domain.auth.accountKey]), never an email. Null: saved before sign-in. */
    val owner: String? = null,
) {
    val turns: Int get() = messages.count { it.role == io.novawerk.psygym.domain.model.Role.Counselor }
    val durationMillis: Long get() = (endedAtMillis - startedAtMillis).coerceAtLeast(0)
}

/**
 * Practice history on this phone: one JSON file per session in the app's private
 * directory. Not uploaded, not synced, not encrypted (decision 0005 leaves encryption
 * open). Android: allowBackup=false. iOS: Application Support, excluded from backup.
 *
 * Each session belongs to an account (login.md "练习记录跟账号走"): the list shows only the
 * signed-in account's sessions. This is filtering, not protection: the files aren't encrypted.
 */
class HistoryRepository(
    private val dir: Path,
    private val fileSystem: FileSystem = FileSystem.SYSTEM,
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val mutex = Mutex()
    private val _sessions = MutableStateFlow<List<SavedSession>?>(null)
    private var owner: String? = null

    /** The signed-in account's sessions, newest first. Null until the first [load]. */
    val sessions: StateFlow<List<SavedSession>?> = _sessions.asStateFlow()

    /**
     * Switches to [account] (null: signed out, nothing shows). Sessions saved before anyone
     * signed in (owner null, from the version without accounts) go to the first account that
     * signs in (login.md §1 "迁移").
     */
    suspend fun setOwner(account: String?) = mutex.withLock {
        owner = account
        if (account != null) {
            readFiles().filter { it.owner == null }.forEach { write(it.copy(owner = account)) }
        }
        _sessions.value = readAll()
    }

    /** Deletes every session of [account] (deleting the account deletes its history). */
    suspend fun deleteAccount(account: String) = mutex.withLock {
        readFiles().filter { it.owner == account }.forEach { s -> io { fileSystem.delete(file(s.id), mustExist = false) } }
        _sessions.value = readAll()
    }

    // Disk trouble (full, unreadable) never crashes the app: a save that fails is skipped,
    // a list that can't be read is empty. History is a convenience, not the practice itself.

    suspend fun load() = mutex.withLock { _sessions.value = readAll() }

    /** Returns false when the file couldn't be written. */
    /** Saved under the signed-in account. Returns false when the file couldn't be written. */
    suspend fun save(session: SavedSession): Boolean = mutex.withLock {
        val ok = write(session.copy(owner = session.owner ?: owner))
        _sessions.value = readAll()
        ok
    }

    private suspend fun write(session: SavedSession): Boolean = io {
        fileSystem.createDirectories(dir)
        fileSystem.write(file(session.id)) { writeUtf8(json.encodeToString(SavedSession.serializer(), session)) }
    } != null

    suspend fun delete(id: String) = mutex.withLock {
        io { fileSystem.delete(file(id), mustExist = false) }
        _sessions.value = readAll()
    }

    /** "Delete all practice history": the signed-in account's sessions. */
    suspend fun deleteAll() = mutex.withLock {
        readAll().forEach { s -> io { fileSystem.delete(file(s.id), mustExist = false) } }
        _sessions.value = readAll()
    }

    fun find(id: String): SavedSession? = _sessions.value?.firstOrNull { it.id == id }

    // Only the signed-in account's. With no one signed in, nothing.
    private suspend fun readAll(): List<SavedSession> = owner?.let { o -> readFiles().filter { it.owner == o } } ?: emptyList()

    private suspend fun readFiles(): List<SavedSession> = io {
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
