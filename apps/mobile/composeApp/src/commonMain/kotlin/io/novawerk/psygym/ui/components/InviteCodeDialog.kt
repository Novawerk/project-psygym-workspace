package io.novawerk.psygym.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.invite_dialog_body
import io.novawerk.psygym.resources.invite_dialog_save
import io.novawerk.psygym.resources.invite_dialog_skip
import io.novawerk.psygym.resources.invite_dialog_title
import io.novawerk.psygym.resources.settings_invite_hint
import org.jetbrains.compose.resources.stringResource

/** First-launch prompt. Skipping is fine; a 401 later points to Settings. */
@Composable
fun InviteCodeDialog(onSave: (String) -> Unit, onSkip: () -> Unit) {
    var code by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onSkip,
        title = { Text(stringResource(Res.string.invite_dialog_title)) },
        text = {
            Column {
                Text(stringResource(Res.string.invite_dialog_body))
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it },
                    singleLine = true,
                    placeholder = { Text(stringResource(Res.string.settings_invite_hint)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(code) }, enabled = code.isNotBlank()) {
                Text(stringResource(Res.string.invite_dialog_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onSkip) { Text(stringResource(Res.string.invite_dialog_skip)) }
        },
    )
}
