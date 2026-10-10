package io.novawerk.psygym.ui.navigation

import kotlinx.serialization.Serializable

// Page ids from docs/product/information-architecture.md.

/** O1. */
@Serializable data object WelcomeRoute

/** O2. [thenReady] false when only the disclaimer changed: back to home afterwards. */
@Serializable data class ConsentRoute(val thenReady: Boolean = true)

/** O3. */
@Serializable data object ReadyRoute

/** H1. */
@Serializable data object HomeRoute

/** C1. */
@Serializable data object CasesRoute

/** C2. The case itself is in [io.novawerk.psygym.domain.practice.PracticeSession]. */
@Serializable data object BriefingRoute

/** S1 (S2 is a sheet on it). */
@Serializable data object PracticeRoute

/** R1. */
@Serializable data object SupervisionRoute

/** X1. */
@Serializable data object HelpRoute

/** P1 · Me. */
@Serializable data object MeRoute

/** P1 opened from an error card (e.g. a bad invite code): a back arrow, no bottom bar. */
@Serializable data object SettingsRoute

/** M1. */
@Serializable data object HistoryRoute

/** M2. */
@Serializable data class HistoryDetailRoute(val id: String)

/** P3. */
@Serializable data object PrivacyRoute
