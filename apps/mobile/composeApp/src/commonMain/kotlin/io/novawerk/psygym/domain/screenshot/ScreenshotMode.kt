package io.novawerk.psygym.domain.screenshot

import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.Message
import kotlin.time.Duration

/**
 * Store-screenshot mode: written cases, sessions and reports, no demo badges, no typing.
 *
 * Only the hook lives here. The content and the only code that can create a
 * [ScreenshotMode] are in the Android debug source set (src/androidDebug); the release
 * variant and iOS always pass `ScreenshotModeHolder(null)`.
 */
class ScreenshotMode(
    /** Serves the written cases and reports. */
    val api: PsygymApi,
    /** The written session for a case in a language, shown when the session opens. */
    val seed: (caseId: String, locale: ApiLocale) -> SessionSeed?,
)

/** A session already under way: its messages and how long it has been running. */
class SessionSeed(val messages: List<Message>, val elapsed: Duration)

/** Wrapper so the component can be given "no screenshot mode" (kotlin-inject has no nullable roots). */
data class ScreenshotModeHolder(val mode: ScreenshotMode?)
