package io.novawerk.psygym

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import io.novawerk.psygym.di.AppComponent
import io.novawerk.psygym.di.HistoryDir
import io.novawerk.psygym.domain.screenshot.ScreenshotModeHolder
import io.novawerk.psygym.screenshot.ScreenshotHooks
import io.novawerk.psygym.screenshot.ScreenshotLaunch
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import io.novawerk.psygym.di.create
import okio.Path.Companion.toPath

private const val DATA_STORE_FILE_NAME = "psygym.preferences_pb"

// One component per process: DataStore must be a singleton, and the in-memory
// practice session should survive Activity re-creation.
@Volatile private var sharedComponent: AppComponent? = null
private val componentLock = Any()

private fun appComponent(context: Context, screenshot: ScreenshotLaunch?): AppComponent {
    sharedComponent?.let { return it }
    return synchronized(componentLock) {
        sharedComponent ?: AppComponent.create(
            appDataStore(context),
            // App-private storage; allowBackup=false keeps it out of backups.
            HistoryDir(context.applicationContext.filesDir.resolve("history").absolutePath),
            // Always null in release builds (see ScreenshotHooks in src/androidRelease).
            ScreenshotModeHolder(screenshot?.mode),
        ).also { sharedComponent = it }
    }
}

private fun appDataStore(context: Context): DataStore<Preferences> = PreferenceDataStoreFactory.createWithPath(
    produceFile = {
        context.applicationContext.filesDir.resolve(DATA_STORE_FILE_NAME).absolutePath.toPath()
    },
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val screenshot = ScreenshotHooks.from(intent)
        val component = appComponent(this, screenshot)
        screenshot?.language?.let { lang -> lifecycleScope.launch { component.settingsRepository.setLanguage(lang) } }
        setContent { App(component) }
    }
}
