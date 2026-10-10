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

/** Invite codes never contain whitespace; keyboards sometimes add some ("test code1"). */
fun normalizeInviteCode(code: String): String = code.filterNot { it.isWhitespace() }

/**
 * Bump when the O2 disclaimer changes in substance: everyone sees it again on next launch
 * (docs/product/onboarding.md, docs/safety.md §5).
 */
const val DISCLAIMER_VERSION = "2026-10-v1"

/** Small, local-only settings. Conversations live in [io.novawerk.psygym.domain.history.HistoryRepository], never here. */
class SettingsRepository(private val dataStore: DataStore<Preferences>) {

    val language: Flow<AppLanguage> = dataStore.data.map { AppLanguage.fromStored(it[LANGUAGE]) }

    val inviteCode: Flow<String> = dataStore.data.map { it[INVITE_CODE].orEmpty() }

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

    /** The "don't enter real client information" line shows until the first report. */
    val realInfoHintSeen: Flow<Boolean> = dataStore.data.map { it[REAL_INFO_HINT_SEEN] ?: false }

    /** Demo data instead of the backend. Debug builds only; always false in release. */
    val useFakeApi: Flow<Boolean> = dataStore.data.map {
        AppConfig.isDebug && (it[USE_FAKE_API] ?: AppConfig.fakeApiDefault)
    }

    suspend fun currentInviteCode(): String = inviteCode.first()

    suspend fun currentUseFakeApi(): Boolean = useFakeApi.first()

    suspend fun setLanguage(language: AppLanguage) {
        dataStore.edit { it[LANGUAGE] = language.name }
    }

    suspend fun setInviteCode(code: String) {
        dataStore.edit { it[INVITE_CODE] = normalizeInviteCode(code) }
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
        val USE_FAKE_API = booleanPreferencesKey("use_fake_api")
    }
}
