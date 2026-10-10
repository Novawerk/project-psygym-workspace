package io.novawerk.psygym.ui.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.help_body
import io.novawerk.psygym.resources.help_close
import io.novawerk.psygym.resources.help_title
import org.jetbrains.compose.resources.stringResource

/** "Need help?" (safety.md §5, acceptance E3). No hotline numbers until they're verified. */
@Composable
fun HelpDialog(onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(stringResource(Res.string.help_title)) },
        text = { Text(stringResource(Res.string.help_body), style = MaterialTheme.typography.bodyMedium) },
        confirmButton = { TextButton(onClick = onClose) { Text(stringResource(Res.string.help_close)) } },
    )
}
