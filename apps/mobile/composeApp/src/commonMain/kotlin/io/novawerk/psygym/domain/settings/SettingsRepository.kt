package io.novawerk.psygym.domain.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import io.novawerk.psygym.AppConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

enum class AppLanguage(val tag: String?) {
    System(null),
    Zh("zh"),
    En("en"),
    ;

    companion object {
        fun fromStored(value: String?): AppLanguage = entries.firstOrNull { it.name == value } ?: System
    }
}

enum class StartState { Welcome, Consent, Home }

/**
 * Bump when the O2 disclaimer changes in substance: everyone sees it again on next launch
 * (docs/product/onboarding.md, docs/safety.md §5).
 */
const val DISCLAIMER_VERSION = "2026-10-v1"

/**
 * Bump when what the voice-session notice says changes in substance: everyone agrees again
 * before their next voice session (docs/safety.md §1).
 */
const val VOICE_CONSENT_VERSION = "2026-10-v1"

/** Small, local-only settings. Conversations live in [io.novawerk.psygym.domain.history.HistoryRepository], never here. */
class SettingsRepository(private val dataStore: DataStore<Preferences>) {

    val language: Flow<AppLanguage> = dataStore.data.map { AppLanguage.fromStored(it[LANGUAGE]) }

    /**
     * Where the app opens. Null until DataStore answers. The intro runs until the user
     * finished it once and accepted the current disclaimer version (onboarding.md O2).
     */
    val startState: Flow<StartState> = dataStore.data.map {
        val accepted = it[DISCLAIMER_ACCEPTED] == DISCLAIMER_VERSION
        val done = it[ONBOARDING_DONE] ?: false
        when {
            done && accepted -> StartState.Home
            done -> StartState.Consent // the disclaimer changed since they accepted it
            else -> StartState.Welcome
        }
    }

    /** Keep finished sessions on this phone (decision 0005). On by default. */
    val saveHistory: Flow<Boolean> = dataStore.data.map { it[SAVE_HISTORY] ?: true }

    suspend fun currentSaveHistory(): Boolean = saveHistory.first()

    suspend fun setSaveHistory(value: Boolean) {
        dataStore.edit { it[SAVE_HISTORY] = value }
    }

    /**
     * A session was open when the app last stopped. Set when a session starts, cleared when
     * it ends; still set on the next launch means the process was killed mid-session.
     */
    suspend fun setPracticeInProgress(value: Boolean) {
        dataStore.edit { it[PRACTICE_IN_PROGRESS] = value }
    }

    /** Reads and clears [setPracticeInProgress]'s flag. */
    suspend fun consumePracticeInProgress(): Boolean {
        val was = dataStore.data.first()[PRACTICE_IN_PROGRESS] ?: false
        if (was) setPracticeInProgress(false)
        return was
    }

    /** The "don't enter real client information" line shows until the first report. */
    val realInfoHintSeen: Flow<Boolean> = dataStore.data.map { it[REAL_INFO_HINT_SEEN] ?: false }

    /** "Show supervisor notes during a session" (live-supervision.md L-3). On by default. */
    val liveNotes: Flow<Boolean> = dataStore.data.map { it[LIVE_NOTES] ?: true }

    suspend fun setLiveNotes(value: Boolean) {
        dataStore.edit { it[LIVE_NOTES] = value }
    }

    /** Hold to talk instead of the keyboard on S1 (voice-input.md §4). Off by default. */
    val voiceMode: Flow<Boolean> = dataStore.data.map { it[VOICE_MODE] ?: false }

    suspend fun setVoiceMode(value: Boolean) {
        dataStore.edit { it[VOICE_MODE] = value }
    }

    /** Demo data instead of the backend. Debug builds only; always false in release. */
    /** Agreed to the voice-session notice, this version of it. */
    val voiceConsent: Flow<Boolean> = dataStore.data.map { it[VOICE_CONSENT] == VOICE_CONSENT_VERSION }

    suspend fun acceptVoiceConsent() {
        dataStore.edit { it[VOICE_CONSENT] = VOICE_CONSENT_VERSION }
    }

    /** Withdrawn under Me. The notice comes back the next time the user picks voice. */
    suspend fun withdrawVoiceConsent() {
        dataStore.edit {
            it.remove(VOICE_CONSENT)
            it[VOICE_SESSION] = false
        }
    }

    /** The last choice of "type or talk" on the case brief. */
    val voiceSession: Flow<Boolean> = dataStore.data.map { it[VOICE_SESSION] ?: false }

    suspend fun setVoiceSession(value: Boolean) {
        dataStore.edit { it[VOICE_SESSION] = value }
    }

    val useFakeApi: Flow<Boolean> = dataStore.data.map {
        AppConfig.isDebug && (it[USE_FAKE_API] ?: AppConfig.fakeApiDefault)
    }

    /**
     * The invite code the version without sign-in kept. Sent once with the first sign-in so
     * those users skip L3 (login.md §1 "迁移"), then cleared.
     */
    suspend fun legacyInviteCode(): String? = dataStore.data.first()[INVITE_CODE]?.takeIf { it.isNotBlank() }

    suspend fun clearLegacyInviteCode() {
        dataStore.edit { it.remove(INVITE_CODE) }
    }

    /**
     * Someone has signed in on this install. Until then, a user who already finished the intro
     * (in the version without sign-in) sees "You now sign in with email" on L1.
     */
    val signedInOnce: Flow<Boolean> = dataStore.data.map { it[SIGNED_IN_ONCE] ?: false }

    suspend fun markSignedIn() {
        dataStore.edit { it[SIGNED_IN_ONCE] = true }
    }

    /**
     * True once per install. iOS keeps Keychain items when the app is deleted, so a reinstall
     * would still be signed in; the app clears the session the first time it runs.
     */
    suspend fun consumeFirstLaunch(): Boolean {
        val first = dataStore.data.first()[LAUNCHED] != true
        if (first) dataStore.edit { it[LAUNCHED] = true }
        return first
    }

    suspend fun currentUseFakeApi(): Boolean = useFakeApi.first()

    suspend fun setLanguage(language: AppLanguage) {
        dataStore.edit { it[LANGUAGE] = language.name }
    }

    suspend fun acceptDisclaimer() {
        dataStore.edit { it[DISCLAIMER_ACCEPTED] = DISCLAIMER_VERSION }
    }

    suspend fun finishOnboarding() {
        dataStore.edit { it[ONBOARDING_DONE] = true }
    }

    suspend fun markRealInfoHintSeen() {
        dataStore.edit { it[REAL_INFO_HINT_SEEN] = true }
    }

    suspend fun setUseFakeApi(value: Boolean) {
        dataStore.edit { it[USE_FAKE_API] = value }
    }

    private companion object {
        val LANGUAGE = stringPreferencesKey("language")
        val INVITE_CODE = stringPreferencesKey("invite_code")
        val DISCLAIMER_ACCEPTED = stringPreferencesKey("disclaimer_accepted")
        val ONBOARDING_DONE = booleanPreferencesKey("onboarding_done")
        val REAL_INFO_HINT_SEEN = booleanPreferencesKey("real_info_hint_seen")
        val SAVE_HISTORY = booleanPreferencesKey("save_history")
        val PRACTICE_IN_PROGRESS = booleanPreferencesKey("practice_in_progress")
        val USE_FAKE_API = booleanPreferencesKey("use_fake_api")
        val LAUNCHED = booleanPreferencesKey("launched")
        val SIGNED_IN_ONCE = booleanPreferencesKey("signed_in_once")
        val LIVE_NOTES = booleanPreferencesKey("live_notes")
        val VOICE_MODE = booleanPreferencesKey("voice_mode")
        val VOICE_CONSENT = stringPreferencesKey("voice_consent")
        val VOICE_SESSION = booleanPreferencesKey("voice_session")
    }
}
