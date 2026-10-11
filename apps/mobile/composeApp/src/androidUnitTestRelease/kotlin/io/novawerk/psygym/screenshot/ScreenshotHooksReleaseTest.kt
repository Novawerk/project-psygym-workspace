package io.novawerk.psygym.screenshot

import android.content.Intent
import kotlin.test.Test
import kotlin.test.assertNull

/** Release variant: even when asked, there is no screenshot mode. */
class ScreenshotHooksReleaseTest {
    @Test
    fun screenshotIntentGivesNothing() {
        val intent = Intent().apply { putExtra("screenshot", true) }
        assertNull(ScreenshotHooks.from(intent))
        assertNull(ScreenshotHooks.from(null))
    }
}
