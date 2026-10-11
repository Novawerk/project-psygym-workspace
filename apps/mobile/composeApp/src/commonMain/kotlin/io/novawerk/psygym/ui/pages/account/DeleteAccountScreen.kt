package io.novawerk.psygym.ui.pages.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.delete_after
import io.novawerk.psygym.resources.delete_confirm_action
import io.novawerk.psygym.resources.delete_confirm_body
import io.novawerk.psygym.resources.delete_confirm_field_cd
import io.novawerk.psygym.resources.delete_confirm_title
import io.novawerk.psygym.resources.delete_continue
import io.novawerk.psygym.resources.delete_irreversible
import io.novawerk.psygym.resources.delete_local
import io.novawerk.psygym.resources.delete_server
import io.novawerk.psygym.resources.delete_slack
import io.novawerk.psygym.resources.delete_stats
import io.novawerk.psygym.resources.delete_title
import io.novawerk.psygym.resources.logout_cancel
import io.novawerk.psygym.ui.components.BottomActions
import io.novawerk.psygym.ui.components.message
import org.jetbrains.compose.resources.stringResource

/** The first 3 characters of the email unlock "Delete" (login.md "删除账号", step two). */
fun deleteConfirmMatches(email: String, typed: String): Boolean {
    val prefix = email.trim().take(3)
    return prefix.isNotEmpty() && typed.trim().equals(prefix, ignoreCase = true)
}

/**
 * Delete account, step one: what happens, then a red "Continue". Step two is a dialog asking
 * for the first 3 characters of the email. The practice history of this account on this phone
 * is always deleted too (no choice: a deleted account can't sign in again).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeleteAccountScreen(
    email: String,
    deleting: Boolean,
    error: ApiError?,
    onDelete: () -> Unit,
    onBack: () -> Unit,
) {
    var confirm by rememberSaveable { mutableStateOf(false) }
    var typed by rememberSaveable { mutableStateOf("") }
    val danger = ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.error,
        contentColor = MaterialTheme.colorScheme.onError,
    )
    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            BottomActions {
                error?.let {
                    Text(it.message(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.fillMaxWidth())
                }
                Button(
                    onClick = { confirm = true },
                    enabled = !deleting,
                    colors = danger,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) { Text(stringResource(Res.string.delete_continue), style = MaterialTheme.typography.titleSmall) }
            }
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(stringResource(Res.string.delete_title), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(stringResource(Res.string.delete_after), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
            listOf(Res.string.delete_server, Res.string.delete_local, Res.string.delete_stats, Res.string.delete_slack).forEach {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("·", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(stringResource(it), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(
                stringResource(Res.string.delete_irreversible),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
    }

    if (confirm) {
        val fieldLabel = stringResource(Res.string.delete_confirm_field_cd)
        AlertDialog(
            onDismissRequest = {
                confirm = false
                typed = ""
            },
            title = { Text(stringResource(Res.string.delete_confirm_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(stringResource(Res.string.delete_confirm_body, email))
                    OutlinedTextField(
                        value = typed,
                        onValueChange = { typed = it.take(16) },
                        singleLine = true,
                        placeholder = { Text(email.trim().take(3)) },
                        shape = RoundedCornerShape(8.dp),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false),
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = fieldLabel },
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirm = false
                        typed = ""
                        onDelete()
                    },
                    enabled = deleteConfirmMatches(email, typed) && !deleting,
                ) { Text(stringResource(Res.string.delete_confirm_action), color = if (deleteConfirmMatches(email, typed)) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant) }
            },
            dismissButton = {
                TextButton(onClick = {
                    confirm = false
                    typed = ""
                }) { Text(stringResource(Res.string.logout_cancel)) }
            },
        )
    }
}
