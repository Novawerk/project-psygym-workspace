package io.novawerk.psygym.ui.navigation

import kotlinx.serialization.Serializable

@Serializable data object HomeRoute

@Serializable data object CasesRoute

/** The case itself is in [io.novawerk.psygym.domain.practice.PracticeSession]. */
@Serializable data object PracticeRoute

@Serializable data object SupervisionRoute

@Serializable data object SettingsRoute
