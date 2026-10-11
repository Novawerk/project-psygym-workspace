package io.novawerk.psygym.di

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import io.novawerk.psygym.AppConfig
import io.novawerk.psygym.data.api.AuthApi
import io.novawerk.psygym.data.api.Backend
import io.novawerk.psygym.data.api.FakePsygymApi
import io.novawerk.psygym.data.api.KtorPsygymApi
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.data.api.SwitchingPsygymApi
import io.novawerk.psygym.domain.auth.SecureStore
import io.novawerk.psygym.domain.auth.SessionGuard
import io.novawerk.psygym.domain.auth.SessionStore
import io.novawerk.psygym.domain.history.HistoryRepository
import io.novawerk.psygym.domain.practice.CaseStore
import io.novawerk.psygym.domain.practice.PracticeSession
import io.novawerk.psygym.domain.screenshot.ScreenshotModeHolder
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
    @get:Provides val screenshot: ScreenshotModeHolder,
    @get:Provides protected val secureStore: SecureStore,
) {
    abstract val settingsRepository: SettingsRepository
    abstract val practiceSession: PracticeSession
    abstract val caseStore: CaseStore
    abstract val history: HistoryRepository
    abstract val sessions: SessionStore
    abstract val auth: AuthApi

    @AppScope
    @Provides
    protected fun sessions(secure: SecureStore): SessionStore = SessionStore(secure)

    @AppScope
    @Provides
    protected fun caseStore(api: PsygymApi): CaseStore = CaseStore(api)

    @AppScope
    @Provides
    protected fun history(dir: HistoryDir): HistoryRepository = HistoryRepository(dir.path.toPath())
    abstract val api: PsygymApi

    @AppScope
    @Provides
    protected fun settings(dataStore: DataStore<Preferences>): SettingsRepository = SettingsRepository(dataStore)

    @AppScope
    @Provides
    protected fun backend(settings: SettingsRepository, sessions: SessionStore): Backend {
        val real = KtorPsygymApi(baseUrl = AppConfig.apiBaseUrl, token = sessions::token)
        // Release never sees demo data: no fake API (and no demo sign-in) is even built.
        val backend = if (AppConfig.isDebug) {
            SwitchingPsygymApi(real = real, fake = FakePsygymApi(), useFake = settings::currentUseFakeApi)
        } else {
            real
        }
        return SessionGuard(backend, sessions)
    }

    @AppScope
    @Provides
    protected fun api(backend: Backend, screenshot: ScreenshotModeHolder): PsygymApi =
        // Debug-only store-screenshot mode replaces the backend entirely.
        screenshot.mode?.api ?: backend

    @Provides
    protected fun authApi(backend: Backend): AuthApi = backend

    companion object
}

/** Where practice history lives: the app's private storage, never backed up. */
data class HistoryDir(val path: String)

@KmpComponentCreate
expect fun AppComponent.Companion.create(
    dataStore: DataStore<Preferences>,
    historyDir: HistoryDir,
    screenshot: ScreenshotModeHolder,
    secureStore: SecureStore,
): AppComponent
