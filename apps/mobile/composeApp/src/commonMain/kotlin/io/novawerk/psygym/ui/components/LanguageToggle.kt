package io.novawerk.psygym.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.settings.AppLanguage
import io.novawerk.psygym.ui.locale.rememberApiLocale

/**
 * 中 | EN in the intro's top right (onboarding.md: switchable from the first screen). Both
 * options show, the current one as a pill (design O1–O3). The labels are language names,
 * so they read the same in both languages.
 */
@Composable
fun LanguageToggle(onChange: (AppLanguage) -> Unit, modifier: Modifier = Modifier) {
    val current = rememberApiLocale()
    PillToggle(
        options = listOf(ApiLocale.Zh to "中", ApiLocale.En to "EN"),
        selected = current,
        onSelect = { if (it != current) onChange(if (it == ApiLocale.Zh) AppLanguage.Zh else AppLanguage.En) },
        track = MaterialTheme.colorScheme.surfaceContainerHighest,
        modifier = modifier,
    )
}
