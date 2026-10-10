package io.novawerk.psygym.ui.locale

import android.content.res.Resources
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidedValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalResources
import java.util.Locale

actual object LocalAppLocale {

    actual val current: String
        @Composable get() = Locale.getDefault().toString()

    @Composable
    actual infix fun provides(value: String?): ProvidedValue<*> {
        val configuration = LocalConfiguration.current
        // "Follow system" reads the system's current language each time, so a change in
        // system settings shows up without restarting the app.
        val new = when (value) {
            null -> Resources.getSystem().configuration.locales[0]
            else -> Locale.forLanguageTag(value)
        }
        Locale.setDefault(new)
        @Suppress("DEPRECATION")
        configuration.setLocale(new)
        val resources = LocalResources.current
        @Suppress("DEPRECATION")
        resources.updateConfiguration(configuration, resources.displayMetrics)
        return LocalConfiguration.provides(configuration)
    }
}
