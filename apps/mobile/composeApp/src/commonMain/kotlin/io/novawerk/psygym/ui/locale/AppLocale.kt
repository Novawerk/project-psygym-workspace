package io.novawerk.psygym.ui.locale

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidedValue
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.api_locale
import org.jetbrains.compose.resources.stringResource

/** Overrides the UI language. `null` follows the system. Same approach as our other KMP apps. */
expect object LocalAppLocale {
    val current: String
        @Composable get

    @Composable
    infix fun provides(value: String?): ProvidedValue<*>
}

/** The language the UI actually resolved to, which is what we ask the backend to answer in. */
@Composable
fun rememberApiLocale(): ApiLocale = ApiLocale.fromTag(stringResource(Res.string.api_locale))
