// Throwaway verification app for hold-to-talk (not merged; see ../README.md).
rootProject.name = "voice-spike"

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

include(":app")
