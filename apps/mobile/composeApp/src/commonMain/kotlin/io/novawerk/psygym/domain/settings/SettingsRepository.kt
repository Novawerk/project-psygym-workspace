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

/** Small, local-only settings. No conversation text is ever stored. */
class SettingsRepository(private val dataStore: DataStore<Preferences>) {

    val language: Flow<AppLanguage> = dataStore.data.map { AppLanguage.fromStored(it[LANGUAGE]) }

    val inviteCode: Flow<String> = dataStore.data.map { it[INVITE_CODE].orEmpty() }

    /** True once we've asked for an invite code on first launch (saved or skipped). */
    val invitePrompted: Flow<Boolean> = dataStore.data.map { it[INVITE_PROMPTED] ?: false }

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
        dataStore.edit {
            it[INVITE_CODE] = code.trim()
            it[INVITE_PROMPTED] = true
        }
    }

    suspend fun markInvitePrompted() {
        dataStore.edit { it[INVITE_PROMPTED] = true }
    }

    suspend fun setUseFakeApi(value: Boolean) {
        dataStore.edit { it[USE_FAKE_API] = value }
    }

    private companion object {
        val LANGUAGE = stringPreferencesKey("language")
        val INVITE_CODE = stringPreferencesKey("invite_code")
        val INVITE_PROMPTED = booleanPreferencesKey("invite_prompted")
        val USE_FAKE_API = booleanPreferencesKey("use_fake_api")
    }
}
