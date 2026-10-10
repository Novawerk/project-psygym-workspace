package io.novawerk.psygym.di

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import io.novawerk.psygym.AppConfig
import io.novawerk.psygym.data.api.FakePsygymApi
import io.novawerk.psygym.data.api.KtorPsygymApi
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.data.api.SwitchingPsygymApi
import io.novawerk.psygym.domain.practice.PracticeSession
import io.novawerk.psygym.domain.settings.SettingsRepository
import me.tatarka.inject.annotations.Component
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
) {
    abstract val settingsRepository: SettingsRepository
    abstract val practiceSession: PracticeSession
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

@KmpComponentCreate
expect fun AppComponent.Companion.create(dataStore: DataStore<Preferences>): AppComponent
