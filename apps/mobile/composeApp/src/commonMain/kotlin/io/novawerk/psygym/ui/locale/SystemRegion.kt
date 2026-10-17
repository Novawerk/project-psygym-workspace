package io.novawerk.psygym.ui.locale

/**
 * The phone's region (ISO 3166 code like "CN" or "DE") from the system settings, not from the
 * app's language override. Null when the system doesn't say.
 */
expect fun systemRegion(): String?
