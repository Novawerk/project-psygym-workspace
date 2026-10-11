package io.novawerk.psygym.ui.pages.me

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.AppConfig
import io.novawerk.psygym.BuildKonfig
import io.novawerk.psygym.domain.settings.AppLanguage
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.help_link
import io.novawerk.psygym.resources.history_cancel
import io.novawerk.psygym.resources.live_setting
import io.novawerk.psygym.resources.logout_body
import io.novawerk.psygym.resources.logout_cancel
import io.novawerk.psygym.resources.logout_confirm
import io.novawerk.psygym.resources.logout_title
import io.novawerk.psygym.resources.me_account_email
import io.novawerk.psygym.resources.me_account_section
import io.novawerk.psygym.resources.me_delete_account
import io.novawerk.psygym.resources.me_logout
import io.novawerk.psygym.resources.me_settings_section
import io.novawerk.psygym.resources.me_title
import io.novawerk.psygym.resources.settings_debug
import io.novawerk.psygym.resources.settings_fake_api
import io.novawerk.psygym.resources.settings_fake_api_desc
import io.novawerk.psygym.resources.settings_help_section
import io.novawerk.psygym.resources.settings_history_delete_action
import io.novawerk.psygym.resources.settings_history_delete_all
import io.novawerk.psygym.resources.settings_history_delete_confirm
import io.novawerk.psygym.resources.settings_history_section
import io.novawerk.psygym.resources.settings_history_toggle
import io.novawerk.psygym.resources.settings_history_toggle_desc
import io.novawerk.psygym.resources.settings_language
import io.novawerk.psygym.resources.settings_language_en
import io.novawerk.psygym.resources.settings_language_note
import io.novawerk.psygym.resources.settings_language_system
import io.novawerk.psygym.resources.settings_language_zh
import io.novawerk.psygym.resources.settings_privacy
import io.novawerk.psygym.resources.settings_replay_onboarding
import io.novawerk.psygym.resources.settings_version
import io.novawerk.psygym.ui.components.BottomBar
import io.novawerk.psygym.ui.components.PrimaryButton
import io.novawerk.psygym.ui.components.SecondaryButton
import io.novawerk.psygym.ui.theme.cardBorder
import io.novawerk.psygym.ui.components.TopTab
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

/** P1 · Me: settings, practice history switch and delete, help. Top level, with the bottom bar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeScreen(
    language: AppLanguage,
    /** The signed-in email. */
    email: String?,
    saveHistory: Boolean,
    useFakeApi: Boolean,
    onLanguageChange: (AppLanguage) -> Unit,
    onSignOut: () -> Unit,
    onDeleteAccount: () -> Unit,
    onSaveHistoryChange: (Boolean) -> Unit,
    onDeleteAllHistory: () -> Unit,
    onUseFakeApiChange: (Boolean) -> Unit,
    liveNotes: Boolean,
    onLiveNotesChange: (Boolean) -> Unit,
    onReplayOnboarding: () -> Unit,
    onHelp: () -> Unit,
    onPrivacy: () -> Unit,
    onTab: (TopTab) -> Unit,
) {
    var confirmDeleteAll by rememberSaveable { mutableStateOf(false) }
    var confirmSignOut by rememberSaveable { mutableStateOf(false) }
    var pickLanguage by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.me_title)) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = { BottomBar(TopTab.Me, onTab) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            // Each group is a bordered card with lines between rows (design P1). The account
            // comes first; the invite code is gone: it's asked once, at sign-up (login.md §2).
            SectionTitle(Res.string.me_account_section)
            GroupCard {
                InfoRow(Res.string.me_account_email, email.orEmpty())
                RowDivider()
                LinkRow(Res.string.me_logout) { confirmSignOut = true }
                RowDivider()
                LinkRow(Res.string.me_delete_account, danger = true, onClick = onDeleteAccount)
            }

            SectionTitle(Res.string.me_settings_section)
            GroupCard {
                ValueRow(Res.string.settings_language, stringResource(languageLabel(language))) { pickLanguage = true }
                RowDivider()
                // Mid-session supervisor notes (live-supervision.md L-3). On by default.
                SwitchRow(Res.string.live_setting, null, liveNotes, onLiveNotesChange)
            }

            SectionTitle(Res.string.settings_history_section)
            GroupCard {
                SwitchRow(
                    title = Res.string.settings_history_toggle,
                    description = Res.string.settings_history_toggle_desc,
                    checked = saveHistory,
                    onChange = onSaveHistoryChange,
                )
                RowDivider()
                Row(
                    Modifier.fillMaxWidth().clickable { confirmDeleteAll = true }.padding(horizontal = 16.dp, vertical = 14.dp),
                ) {
                    Text(
                        stringResource(Res.string.settings_history_delete_all),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            SectionTitle(Res.string.settings_help_section)
            GroupCard {
                LinkRow(Res.string.help_link, onClick = onHelp)
                RowDivider()
                LinkRow(Res.string.settings_privacy, onClick = onPrivacy)
                RowDivider()
                LinkRow(Res.string.settings_replay_onboarding, onClick = onReplayOnboarding)
            }

            if (AppConfig.isDebug) {
                SectionTitle(Res.string.settings_debug)
                GroupCard {
                    SwitchRow(Res.string.settings_fake_api, Res.string.settings_fake_api_desc, useFakeApi, onUseFakeApiChange)
                    Text(
                        AppConfig.apiBaseUrl,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
            Text(
                stringResource(Res.string.settings_version, BuildKonfig.VERSION_NAME),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(24.dp))
        }
    }

    if (confirmSignOut) SignOutSheet(onDismiss = { confirmSignOut = false }, onConfirm = {
        confirmSignOut = false
        onSignOut()
    })

    if (pickLanguage) {
        // Picked in a dialog; the "follows your system" note lives here (design P1).
        AlertDialog(
            onDismissRequest = { pickLanguage = false },
            title = { Text(stringResource(Res.string.settings_language)) },
            text = {
                Column {
                    Column(Modifier.selectableGroup()) {
                        listOf(AppLanguage.System, AppLanguage.Zh, AppLanguage.En).forEach { value ->
                            LanguageRow(value, languageLabel(value), language) {
                                pickLanguage = false
                                onLanguageChange(it)
                            }
                        }
                    }
                    Text(
                        stringResource(Res.string.settings_language_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { pickLanguage = false }) { Text(stringResource(Res.string.history_cancel)) } },
        )
    }

    if (confirmDeleteAll) {
        AlertDialog(
            onDismissRequest = { confirmDeleteAll = false },
            title = { Text(stringResource(Res.string.settings_history_delete_all)) },
            text = { Text(stringResource(Res.string.settings_history_delete_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDeleteAll = false
                    onDeleteAllHistory()
                }) { Text(stringResource(Res.string.settings_history_delete_action), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDeleteAll = false }) { Text(stringResource(Res.string.history_cancel)) } },
        )
    }
}

private fun languageLabel(language: AppLanguage): StringResource = when (language) {
    AppLanguage.System -> Res.string.settings_language_system
    AppLanguage.Zh -> Res.string.settings_language_zh
    AppLanguage.En -> Res.string.settings_language_en
}

@Composable
private fun GroupCard(content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(shape).border(cardBorder, shape),
        content = content,
    )
}

@Composable
private fun RowDivider() = HorizontalDivider(color = MaterialTheme.colorScheme.outline)

/** A row with a label and its current value, like "Language  Follow system ›". */
@Composable
private fun ValueRow(label: StringResource, value: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(label), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SectionTitle(res: StringResource) {
    Text(
        stringResource(res),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 8.dp),
    )
}

@Composable
private fun SwitchRow(title: StringResource, description: StringResource?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .toggleable(value = checked, onValueChange = onChange, role = Role.Switch)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(stringResource(title), style = MaterialTheme.typography.bodyLarge)
            description?.let { Text(stringResource(it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = checked, onCheckedChange = null)
    }
}

@Composable
private fun LinkRow(label: StringResource, danger: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(label),
            style = MaterialTheme.typography.bodyLarge,
            // Red for the destructive one, as "delete all practice history" (login.md P1).
            color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun LanguageRow(value: AppLanguage, label: StringResource, selected: AppLanguage, onSelect: (AppLanguage) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .selectable(selected = value == selected, onClick = { onSelect(value) }, role = Role.RadioButton)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = value == selected, onClick = null)
        Spacer(Modifier.width(16.dp))
        Text(stringResource(label), style = MaterialTheme.typography.bodyLarge)
    }
}

/** A label and a value that can't be changed here, like the email. */
@Composable
private fun InfoRow(label: StringResource, value: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(stringResource(label), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Sign out? (bottom sheet, login.md "退出登录"). History stays on the phone. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SignOutSheet(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    // Fully open at once: the text is long, and half open would hide the buttons on smaller screens.
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.background,
    ) {
        Column(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(Res.string.logout_title), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                stringResource(Res.string.logout_body),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            PrimaryButton(stringResource(Res.string.logout_confirm), onConfirm)
            SecondaryButton(stringResource(Res.string.logout_cancel), onDismiss)
        }
    }
}
