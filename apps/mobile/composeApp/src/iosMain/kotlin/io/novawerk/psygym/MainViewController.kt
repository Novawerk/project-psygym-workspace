package io.novawerk.psygym

import androidx.compose.ui.window.ComposeUIViewController
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import io.novawerk.psygym.di.AppComponent
import io.novawerk.psygym.di.create
import kotlinx.cinterop.ExperimentalForeignApi
import okio.Path.Companion.toPath
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSURL
import platform.Foundation.NSUserDomainMask

private const val DATA_STORE_FILE_NAME = "psygym.preferences_pb"

// One component per process: DataStore must be a singleton.
private val component: AppComponent by lazy {
    AppComponent.create(
        PreferenceDataStoreFactory.createWithPath(produceFile = { dataStorePath(DATA_STORE_FILE_NAME).toPath() }),
    )
}

fun MainViewController() = ComposeUIViewController { App(component) }

@OptIn(ExperimentalForeignApi::class)
private fun dataStorePath(fileName: String): String {
    val documents: NSURL? = NSFileManager.defaultManager.URLForDirectory(
        directory = NSDocumentDirectory,
        inDomain = NSUserDomainMask,
        appropriateForURL = null,
        create = false,
        error = null,
    )
    return requireNotNull(documents).path + "/$fileName"
}
