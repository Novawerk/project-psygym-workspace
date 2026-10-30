package io.novawerk.psygym

import io.novawerk.psygym.data.auth.KeychainSecureStore
import io.novawerk.psygym.data.voice.AppleSpeechBridge
import io.novawerk.psygym.data.voice.AppleVoiceCall
import io.novawerk.psygym.data.voice.AppleVoiceCallBridge
import io.novawerk.psygym.data.voice.AppleVoiceInput
import platform.UIKit.UIViewController
import androidx.compose.ui.window.ComposeUIViewController
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import io.novawerk.psygym.di.AppComponent
import io.novawerk.psygym.di.HistoryDir
import io.novawerk.psygym.domain.screenshot.ScreenshotModeHolder
import io.novawerk.psygym.di.create
import kotlinx.cinterop.ExperimentalForeignApi
import okio.Path.Companion.toPath
import platform.Foundation.NSApplicationSupportDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSURL
import platform.Foundation.NSURLIsExcludedFromBackupKey
import platform.Foundation.NSUserDomainMask

private const val DATA_STORE_FILE_NAME = "psygym.preferences_pb"

// Set by Swift before the first frame: Apple's speech APIs live in iosApp (SpeechBridge.swift).
private var speechBridge: AppleSpeechBridge? = null
private var voiceCallBridge: AppleVoiceCallBridge? = null

// One component per process: DataStore must be a singleton.
private val component: AppComponent by lazy {
    AppComponent.create(
        PreferenceDataStoreFactory.createWithPath(produceFile = { appSupportPath(DATA_STORE_FILE_NAME).toPath() }),
        HistoryDir(appSupportPath("history")),
        // Store-screenshot mode is Android-debug only.
        ScreenshotModeHolder(null),
        KeychainSecureStore(),
        AppleVoiceInput(requireNotNull(speechBridge)),
        AppleVoiceCall(requireNotNull(voiceCallBridge)),
    )
}

fun MainViewController(speech: AppleSpeechBridge, voiceCall: AppleVoiceCallBridge): UIViewController {
    speechBridge = speech
    voiceCallBridge = voiceCall
    return ComposeUIViewController { App(component) }
}

// Application Support, not Documents: Documents is user-visible and backed up to iCloud.
// The whole directory is excluded from backup: it holds settings and practice history.
@OptIn(ExperimentalForeignApi::class)
private fun appSupportPath(fileName: String): String {
    val dir: NSURL = requireNotNull(
        NSFileManager.defaultManager.URLForDirectory(
            directory = NSApplicationSupportDirectory,
            inDomain = NSUserDomainMask,
            appropriateForURL = null,
            create = true,
            error = null,
        ),
    )
    dir.setResourceValue(true, forKey = NSURLIsExcludedFromBackupKey, error = null)
    return requireNotNull(dir.path) + "/$fileName"
}
