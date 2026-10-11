package io.novawerk.psygym.data.api

import io.novawerk.psygym.AppConfig
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

/**
 * Release builds can't sign in with demo codes. Two guards: AppComponent never builds the demo
 * backend when AppConfig.isDebug is false (release goes straight to KtorPsygymApi), and the demo
 * sign-in itself refuses to exist in a release build. This test runs against the release
 * variant (BuildConfig.DEBUG = false) and pins both halves of the second guard.
 */
class FakeAuthReleaseTest {
    @Test
    fun releaseIsNotDebug() {
        assertFalse(AppConfig.isDebug)
        assertFalse(AppConfig.fakeApiDefault)
    }

    @Test
    fun demoSignInCantBeBuilt() {
        assertFailsWith<IllegalStateException> { FakeAuthApi() }
    }

    @Test
    fun theDemoBackendRefusesToSignIn() = runTest {
        // Cases and reports still work for the report tests; signing in doesn't.
        assertFailsWith<IllegalStateException> { FakePsygymApi().verify("lin@example.com", "123456") }
    }

    @Test
    fun theDemoDataSwitchIsNotOnTheSignInScreen() {
        assertFalse(AppConfig.demoSwitchOnSignIn)
    }
}
