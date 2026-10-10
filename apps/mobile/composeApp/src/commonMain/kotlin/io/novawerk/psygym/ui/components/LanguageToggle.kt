package io.novawerk.psygym.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.settings.AppLanguage
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.lang_toggle
import io.novawerk.psygym.resources.lang_toggle_cd
import io.novawerk.psygym.ui.locale.rememberApiLocale
import org.jetbrains.compose.resources.stringResource

/** 中 / EN in the intro's top right (onboarding.md: switchable from the first screen). */
@Composable
fun LanguageToggle(onChange: (AppLanguage) -> Unit, modifier: Modifier = Modifier) {
    val current = rememberApiLocale()
    val cd = stringResource(Res.string.lang_toggle_cd)
    TextButton(
        onClick = { onChange(if (current == ApiLocale.Zh) AppLanguage.En else AppLanguage.Zh) },
        modifier = modifier.semantics { contentDescription = cd },
    ) {
        Text(stringResource(Res.string.lang_toggle), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
    }
}
