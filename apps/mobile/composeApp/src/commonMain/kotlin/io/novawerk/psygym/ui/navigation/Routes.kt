package io.novawerk.psygym.ui.navigation

import kotlinx.serialization.Serializable

// Page ids from docs/product/information-architecture.md.

/** O1. */
@Serializable data object WelcomeRoute

/** O2, the last intro page. Also shown alone when the disclaimer changed. */
@Serializable data object ConsentRoute

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

/**
 * L1–L3: one page that steps through email, code and invite code (state in LoginFlow).
 * [notice] is one of the NOTICE_* values; [returnBack] when the session expired mid-use:
 * after signing in, back to the page the user was on.
 */
@Serializable data class LoginRoute(val notice: String? = null, val returnBack: Boolean = false) {
    companion object {
        const val NOTICE_MIGRATION = "migration"
        const val NOTICE_EXPIRED = "expired"
        const val NOTICE_DELETED = "deleted"
    }
}

/** Delete account, step one (P1 → 删除账号). */
@Serializable data object DeleteAccountRoute

/** M1. */
@Serializable data object HistoryRoute

/** M2. */
@Serializable data class HistoryDetailRoute(val id: String)

/** P3. */
@Serializable data object PrivacyRoute

/** Open-source licences (voice-input.md §2). */
@Serializable data object LicensesRoute
