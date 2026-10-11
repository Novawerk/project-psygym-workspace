package io.novawerk.psygym.domain.auth

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okio.ByteString.Companion.encodeUtf8

/**
 * The platform's secure storage for one small secret (login.md "会话 token 存在哪"): Android
 * Keystore-encrypted, iOS Keychain. Never plain preferences, never logs, never backups.
 */
interface SecureStore {
    suspend fun read(): String?

    /** Null deletes. */
    suspend fun write(value: String?)
}

/** The signed-in account on this phone. */
@Serializable
data class StoredSession(val token: String, val email: String) {
    /** What practice history is filed under: never the email itself. */
    val accountKey: String get() = accountKey(email)
}

/**
 * Practice history is filed under sha256 of the trimmed, lower-cased email, in hex: the same
 * email finds its history again, and the history files never hold the address.
 */
fun accountKey(email: String): String = email.trim().lowercase().encodeUtf8().sha256().hex()

/** Holds the session token for every request. The token lives only in [SecureStore]. */
class SessionStore(private val secure: SecureStore) {
    private val json = Json { ignoreUnknownKeys = true }
    private val _session = MutableStateFlow<StoredSession?>(null)
    private val _loaded = MutableStateFlow(false)
    private val _expired = MutableStateFlow(false)

    val session: StateFlow<StoredSession?> = _session.asStateFlow()

    /** False until [load] has read the secure storage. */
    val loaded: StateFlow<Boolean> = _loaded.asStateFlow()

    /** The server said the session is gone; the app goes to sign-in. */
    val expired: StateFlow<Boolean> = _expired.asStateFlow()

    suspend fun load() {
        _session.value = secure.read()?.let { runCatching { json.decodeFromString(StoredSession.serializer(), it) }.getOrNull() }
        _loaded.value = true
    }

    /** For each request. Waits for [load], so the first requests don't go out without it. */
    suspend fun token(): String? {
        loaded.first { it }
        return _session.value?.token
    }

    suspend fun save(session: StoredSession) {
        secure.write(json.encodeToString(StoredSession.serializer(), session))
        _session.value = session
        _expired.value = false
    }

    suspend fun clear() {
        secure.write(null)
        _session.value = null
    }

    /** The server refused the token: forget it and ask to sign in again. */
    suspend fun markExpired() {
        if (_session.value == null && _expired.value) return
        clear()
        _expired.value = true
    }

    fun consumeExpired() {
        _expired.value = false
    }
}
