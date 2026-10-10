import com.codingfeline.buildkonfig.compiler.FieldSpec.Type.BOOLEAN
import com.codingfeline.buildkonfig.compiler.FieldSpec.Type.INT
import com.codingfeline.buildkonfig.compiler.FieldSpec.Type.STRING
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

val appId: String = libs.versions.app.id.get()
val appVersionName: String = System.getenv("VERSION_NAME") ?: libs.versions.app.versionName.get()
val appVersionCode: Int = System.getenv("VERSION_CODE")?.toIntOrNull()
    ?: libs.versions.app.versionCode.get().toInt()

// Release = an Android *Release task, or Xcode building the Release configuration.
// BuildKonfig is generated per build, not per Android build type, so we decide here.
val isRelease: Boolean = gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) } ||
    System.getenv("CONFIGURATION") == "Release"

// Backend base URL. Override with -Ppsygym.apiBaseUrl=http://192.168.x.x:8787 to test
// on a real device against a laptop. Android emulator reaches the host at 10.0.2.2;
// the iOS simulator at localhost.
val prodApiBaseUrl = "https://psygym-api.novawerk.io"
val apiBaseUrlOverride = providers.gradleProperty("psygym.apiBaseUrl").orNull
val androidApiBaseUrl = apiBaseUrlOverride ?: if (isRelease) prodApiBaseUrl else "http://10.0.2.2:8787"
val iosApiBaseUrl = apiBaseUrlOverride ?: if (isRelease) prodApiBaseUrl else "http://localhost:8787"

// Until the backend is live, debug builds start on demo data (FakeApi). A debug-only
// switch in Settings flips it at runtime. Release never uses demo data.
val useFakeApiByDefault = providers.gradleProperty("psygym.fakeApi").orNull?.toBoolean() ?: !isRelease

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.buildkonfig)
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    listOf(
        iosArm64(),
        iosSimulatorArm64(),
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "ComposeApp"
            isStatic = true
        }
    }

    sourceSets {
        androidMain.dependencies {
            implementation(compose.preview)
            implementation(libs.androidx.activity.compose)
            implementation(libs.ktor.client.okhttp)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(libs.material3)
            implementation(compose.ui)
            implementation(compose.components.resources)
            implementation(compose.components.uiToolingPreview)
            implementation(compose.materialIconsExtended)
            implementation(libs.androidx.lifecycle.viewmodelCompose)
            implementation(libs.androidx.lifecycle.runtimeCompose)
            implementation(libs.navigation.compose)
            implementation(libs.datastore.preferences)
            implementation(libs.kotlin.inject.runtime)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.kotlinx.json)
            implementation(libs.markdown.renderer.m3)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.ktor.client.mock)
        }
        // Streaming tests run the real OkHttp engine against a local JDK HttpServer.
        androidUnitTest.dependencies {
            implementation(libs.junit)
        }
    }
}

android {
    namespace = appId
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = appId
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = appVersionCode
        versionName = appVersionName
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

buildkonfig {
    packageName = appId
    defaultConfigs {
        buildConfigField(STRING, "VERSION_NAME", appVersionName)
        buildConfigField(INT, "VERSION_CODE", appVersionCode.toString())
        buildConfigField(BOOLEAN, "IS_DEBUG", (!isRelease).toString())
        buildConfigField(BOOLEAN, "USE_FAKE_API", useFakeApiByDefault.toString())
        buildConfigField(STRING, "API_BASE_URL", androidApiBaseUrl)
    }
    targetConfigs {
        listOf("iosArm64", "iosSimulatorArm64").forEach { target ->
            create(target) {
                buildConfigField(STRING, "API_BASE_URL", iosApiBaseUrl)
            }
        }
    }
}

compose.resources {
    packageOfResClass = "$appId.resources"
}

dependencies {
    debugImplementation(compose.uiTooling)
    add("kspAndroid", libs.kotlin.inject.compiler)
    add("kspIosArm64", libs.kotlin.inject.compiler)
    add("kspIosSimulatorArm64", libs.kotlin.inject.compiler)
}
