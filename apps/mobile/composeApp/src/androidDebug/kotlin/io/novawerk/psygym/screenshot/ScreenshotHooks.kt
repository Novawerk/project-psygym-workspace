package io.novawerk.psygym.screenshot

import android.content.Intent
import io.novawerk.psygym.domain.screenshot.ScreenshotMode
import io.novawerk.psygym.domain.settings.AppLanguage

/**
 * Debug variant only. Start the app for store screenshots with
 *
 *     adb shell am start -n io.novawerk.psygym/.MainActivity --ez screenshot true --es lang zh
 *
 * (`lang` is `zh` or `en`). Force-stop first: the mode is read when the process starts.
 */
internal object ScreenshotHooks {
    fun from(intent: Intent?): ScreenshotLaunch? {
        if (intent?.getBooleanExtra("screenshot", false) != true) return null
        val language = when (intent.getStringExtra("lang")) {
            "zh" -> AppLanguage.Zh
            "en" -> AppLanguage.En
            else -> null
        }
        return ScreenshotLaunch(
            mode = ScreenshotMode(api = ScreenshotApi(), seed = ScreenshotContent::seed),
            language = language,
        )
    }
}
