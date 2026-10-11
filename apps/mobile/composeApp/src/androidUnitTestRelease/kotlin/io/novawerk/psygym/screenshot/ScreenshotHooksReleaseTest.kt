package io.novawerk.psygym.screenshot

import kotlin.test.Test
import kotlin.test.assertNull

/**
 * Release variant smoke test. The real guarantee is at compile time: the release source
 * set has no screenshot implementation or content (src/androidRelease holds only this
 * stub; the real ones are in src/androidDebug), and the release APK check in the PR
 * confirms none of it ships. This test only pins that the stub answers "no mode".
 */
class ScreenshotHooksReleaseTest {
    @Test
    fun releaseStubHasNoMode() {
        assertNull(ScreenshotHooks.from(null))
    }
}
