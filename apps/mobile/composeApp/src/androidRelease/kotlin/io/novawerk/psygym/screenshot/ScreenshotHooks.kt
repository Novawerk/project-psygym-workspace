package io.novawerk.psygym.screenshot

import android.content.Intent

/**
 * Release variant: store-screenshot mode doesn't exist. The debug variant has the real
 * one (src/androidDebug, with the written content); only one of the two is compiled.
 */
internal object ScreenshotHooks {
    @Suppress("UNUSED_PARAMETER")
    fun from(intent: Intent?): ScreenshotLaunch? = null
}
