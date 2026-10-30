rootProject.name = "psygym"
enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

pluginManagement {
    repositories {
        google {
            mavenContent {
                includeGroupAndSubgroups("androidx")
                includeGroupAndSubgroups("com.android")
                includeGroupAndSubgroups("com.google")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google {
            mavenContent {
                includeGroupAndSubgroups("androidx")
                includeGroupAndSubgroups("com.android")
                includeGroupAndSubgroups("com.google")
            }
        }
        mavenCentral()
        // sherpa-onnx (on-device speech, ADR 0010) and LiveKit's audioswitch (voice sessions,
        // ADR 0013) are published only here. Nothing else may come from JitPack.
        exclusiveContent {
            forRepository { maven("https://jitpack.io") }
            filter {
                includeGroup("com.github.k2-fsa.sherpa-onnx")
                includeGroup("com.github.davidliu")
            }
        }
    }
}

include(":composeApp")
