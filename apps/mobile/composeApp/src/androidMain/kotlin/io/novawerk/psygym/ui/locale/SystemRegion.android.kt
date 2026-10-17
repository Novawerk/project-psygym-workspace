package io.novawerk.psygym.ui.locale

import android.content.res.Resources

// The system configuration, not Locale.getDefault(): the app's language override replaces the
// default locale with one that has no country.
actual fun systemRegion(): String? = Resources.getSystem().configuration.locales[0].country.takeIf { it.isNotEmpty() }
