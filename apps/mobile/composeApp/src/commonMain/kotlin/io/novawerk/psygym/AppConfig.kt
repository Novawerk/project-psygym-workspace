package io.novawerk.psygym

/** True only in debug binaries: Android's debug variant, Xcode's Debug configuration. */
expect val isDebugBuild: Boolean

/** Where the app's settings come from. Release values are fixed here, not by Gradle flags. */
object AppConfig {
    const val PROD_API_BASE_URL = "https://psygym-api.novawerk.io"

    val isDebug: Boolean get() = isDebugBuild

    val apiBaseUrl: String get() = if (isDebug) BuildKonfig.DEV_API_BASE_URL else PROD_API_BASE_URL

    /** Demo data is a debug-only thing. Release can't turn it on. */
    val fakeApiDefault: Boolean get() = isDebug && BuildKonfig.DEV_FAKE_API_DEFAULT

    /**
     * The "Use demo data" switch on L1, so a debug build can sign in without a server. The one
     * in Me is behind sign-in. Never in release.
     */
    val demoSwitchOnSignIn: Boolean get() = isDebug
}
