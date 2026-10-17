package io.novawerk.psygym.ui.locale

import platform.Foundation.NSLocale
import platform.Foundation.countryCode
import platform.Foundation.currentLocale

// The region setting; the app's language override (AppleLanguages) doesn't change it.
actual fun systemRegion(): String? = NSLocale.currentLocale.countryCode?.takeIf { it.isNotEmpty() }
