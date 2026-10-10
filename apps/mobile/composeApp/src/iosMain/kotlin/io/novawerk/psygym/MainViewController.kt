package io.novawerk.psygym

import androidx.compose.ui.window.ComposeUIViewController
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import io.novawerk.psygym.di.AppComponent
import io.novawerk.psygym.di.HistoryDir
import io.novawerk.psygym.di.create
import kotlinx.cinterop.ExperimentalForeignApi
import okio.Path.Companion.toPath
import platform.Foundation.NSApplicationSupportDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSURL
import platform.Foundation.NSURLIsExcludedFromBackupKey
import platform.Foundation.NSUserDomainMask

private const val DATA_STORE_FILE_NAME = "psygym.preferences_pb"

// One component per process: DataStore must be a singleton.
private val component: AppComponent by lazy {
    AppComponent.create(
        PreferenceDataStoreFactory.createWithPath(produceFile = { appSupportPath(DATA_STORE_FILE_NAME).toPath() }),
        HistoryDir(appSupportPath("history")),
    )
}

fun MainViewController() = ComposeUIViewController { App(component) }

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
