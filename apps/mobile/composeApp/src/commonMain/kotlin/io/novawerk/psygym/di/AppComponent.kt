package io.novawerk.psygym.di

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import io.novawerk.psygym.AppConfig
import io.novawerk.psygym.data.api.FakePsygymApi
import io.novawerk.psygym.data.api.KtorPsygymApi
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.data.api.SwitchingPsygymApi
import io.novawerk.psygym.domain.history.HistoryRepository
import io.novawerk.psygym.domain.practice.CaseStore
import io.novawerk.psygym.domain.practice.PracticeSession
import io.novawerk.psygym.domain.settings.SettingsRepository
import me.tatarka.inject.annotations.Component
import okio.Path.Companion.toPath
import me.tatarka.inject.annotations.KmpComponentCreate
import me.tatarka.inject.annotations.Provides
import me.tatarka.inject.annotations.Scope

@Scope
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION, AnnotationTarget.PROPERTY_GETTER)
annotation class AppScope

@AppScope
@Component
abstract class AppComponent(
    @get:Provides protected val dataStore: DataStore<Preferences>,
    @get:Provides protected val historyDir: HistoryDir,
) {
    abstract val settingsRepository: SettingsRepository
    abstract val practiceSession: PracticeSession
    abstract val caseStore: CaseStore
    abstract val history: HistoryRepository

    @AppScope
    @Provides
    protected fun history(dir: HistoryDir): HistoryRepository = HistoryRepository(dir.path.toPath())
    abstract val api: PsygymApi

    @AppScope
    @Provides
    protected fun settings(dataStore: DataStore<Preferences>): SettingsRepository = SettingsRepository(dataStore)

    @AppScope
    @Provides
    protected fun api(settings: SettingsRepository): PsygymApi {
        val real = KtorPsygymApi(baseUrl = AppConfig.apiBaseUrl, inviteCode = settings::currentInviteCode)
        // Release never sees demo data: no fake API is even built.
        if (!AppConfig.isDebug) return real
        return SwitchingPsygymApi(real = real, fake = FakePsygymApi(), useFake = settings::currentUseFakeApi)
    }

    companion object
}

/** Where practice history lives: the app's private storage, never backed up. */
data class HistoryDir(val path: String)

@KmpComponentCreate
expect fun AppComponent.Companion.create(dataStore: DataStore<Preferences>, historyDir: HistoryDir): AppComponent
