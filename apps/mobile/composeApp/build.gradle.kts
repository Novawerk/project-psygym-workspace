import com.codingfeline.buildkonfig.compiler.FieldSpec.Type.BOOLEAN
import com.codingfeline.buildkonfig.compiler.FieldSpec.Type.INT
import com.codingfeline.buildkonfig.compiler.FieldSpec.Type.STRING
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

val appId: String = libs.versions.app.id.get()
val appVersionName: String = System.getenv("VERSION_NAME") ?: libs.versions.app.versionName.get()
val appVersionCode: Int = System.getenv("VERSION_CODE")?.toIntOrNull()
    ?: libs.versions.app.versionCode.get().toInt()

// Play upload key: read from ~/.gradle/gradle.properties or the environment, never from
// the repo. Without all four, release builds are left unsigned so anyone can still build.
fun releaseSecret(name: String): String? =
    providers.gradleProperty(name).orNull ?: providers.environmentVariable(name).orNull
val uploadStoreFile = releaseSecret("PSYGYM_UPLOAD_STORE_FILE")
val uploadStorePassword = releaseSecret("PSYGYM_UPLOAD_STORE_PASSWORD")
val uploadKeyAlias = releaseSecret("PSYGYM_UPLOAD_KEY_ALIAS")
val uploadKeyPassword = releaseSecret("PSYGYM_UPLOAD_KEY_PASSWORD")
val hasUploadKey = listOf(uploadStoreFile, uploadStorePassword, uploadKeyAlias, uploadKeyPassword).all { !it.isNullOrBlank() }

// Debug vs release is decided by the build itself, not here: Android reads its
// variant's BuildConfig.DEBUG, iOS reads Platform.isDebugBinary (Xcode Debug vs
// Release). Release always talks to production and can never use demo data; the
// values below only feed debug builds.
//
// Override the dev backend with -Ppsygym.apiBaseUrl=http://192.168.x.x:8787 to test on
// a real phone against a laptop. Android emulator reaches the host at 10.0.2.2; the iOS
// simulator at localhost.
val devApiBaseUrlOverride = providers.gradleProperty("psygym.apiBaseUrl").orNull
val androidDevApiBaseUrl = devApiBaseUrlOverride ?: "http://10.0.2.2:8787"
val iosDevApiBaseUrl = devApiBaseUrlOverride ?: "http://localhost:8787"

// Debug builds start on demo data (FakeApi) until told otherwise. Debug only.
val devFakeApiDefault = providers.gradleProperty("psygym.fakeApi").orNull?.toBoolean() ?: true

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
    sourceSets.all {
        languageSettings.optIn("kotlin.time.ExperimentalTime")
    }

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
            implementation(libs.compose.ui.backhandler)
            implementation(libs.datastore.preferences)
            implementation(libs.kotlin.inject.runtime)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.datetime)
            implementation(libs.okio)
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
            implementation(libs.okio.fakefilesystem)
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
    buildFeatures {
        buildConfig = true
    }
    signingConfigs {
        if (hasUploadKey) {
            create("upload") {
                storeFile = file(uploadStoreFile!!)
                storePassword = uploadStorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            // Play App Signing re-signs for the store; this is only the upload key.
            if (hasUploadKey) signingConfig = signingConfigs.getByName("upload")
        }
    }
    testOptions {
        // JVM unit tests use android.jar stubs; let them return defaults (e.g. new Intent()).
        unitTests.isReturnDefaultValues = true
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
        // Only read when the binary is a debug build (see AppConfig).
        buildConfigField(BOOLEAN, "DEV_FAKE_API_DEFAULT", devFakeApiDefault.toString())
        buildConfigField(STRING, "DEV_API_BASE_URL", androidDevApiBaseUrl)
    }
    targetConfigs {
        listOf("iosArm64", "iosSimulatorArm64").forEach { target ->
            create(target) {
                buildConfigField(STRING, "DEV_API_BASE_URL", iosDevApiBaseUrl)
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
