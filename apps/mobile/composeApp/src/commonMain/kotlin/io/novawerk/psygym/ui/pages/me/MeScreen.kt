package io.novawerk.psygym.ui.pages.me

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.AppConfig
import io.novawerk.psygym.BuildKonfig
import io.novawerk.psygym.domain.settings.AppLanguage
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.help_link
import io.novawerk.psygym.resources.history_cancel
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
import io.novawerk.psygym.resources.settings_invite
import io.novawerk.psygym.resources.settings_invite_desc
import io.novawerk.psygym.resources.settings_invite_hint
import io.novawerk.psygym.resources.settings_invite_save
import io.novawerk.psygym.resources.settings_invite_saved
import io.novawerk.psygym.resources.settings_language
import io.novawerk.psygym.resources.settings_language_en
import io.novawerk.psygym.resources.settings_language_system
import io.novawerk.psygym.resources.settings_language_zh
import io.novawerk.psygym.resources.settings_privacy
import io.novawerk.psygym.resources.settings_replay_onboarding
import io.novawerk.psygym.resources.settings_version
import io.novawerk.psygym.ui.components.BottomBar
import io.novawerk.psygym.ui.components.TopTab
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

/** P1 · Me: settings, practice history switch and delete, help. Top level, with the bottom bar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeScreen(
    language: AppLanguage,
    inviteCode: String,
    saveHistory: Boolean,
    useFakeApi: Boolean,
    onLanguageChange: (AppLanguage) -> Unit,
    onInviteCodeSave: (String) -> Unit,
    onSaveHistoryChange: (Boolean) -> Unit,
    onDeleteAllHistory: () -> Unit,
    onUseFakeApiChange: (Boolean) -> Unit,
    onReplayOnboarding: () -> Unit,
    onHelp: () -> Unit,
    onPrivacy: () -> Unit,
    onTab: (TopTab) -> Unit,
    /** Set when opened on top of a flow (from an error card): back arrow, no bottom bar. */
    onBack: (() -> Unit)? = null,
) {
    var confirmDeleteAll by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.me_title)) },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = { if (onBack == null) BottomBar(TopTab.Me, onTab) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            SectionTitle(Res.string.me_settings_section)
            ItemTitle(Res.string.settings_language)
            Column(Modifier.selectableGroup()) {
                LanguageRow(AppLanguage.System, Res.string.settings_language_system, language, onLanguageChange)
                LanguageRow(AppLanguage.Zh, Res.string.settings_language_zh, language, onLanguageChange)
                LanguageRow(AppLanguage.En, Res.string.settings_language_en, language, onLanguageChange)
            }
            ItemTitle(Res.string.settings_invite, top = 12.dp)
            InviteCodeField(inviteCode, onInviteCodeSave)

            Divider()
            SectionTitle(Res.string.settings_history_section)
            SwitchRow(
                title = Res.string.settings_history_toggle,
                description = Res.string.settings_history_toggle_desc,
                checked = saveHistory,
                onChange = onSaveHistoryChange,
            )
            Row(
                Modifier.fillMaxWidth().clickable { confirmDeleteAll = true }.padding(horizontal = 16.dp, vertical = 14.dp),
            ) {
                Text(
                    stringResource(Res.string.settings_history_delete_all),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Divider()
            SectionTitle(Res.string.settings_help_section)
            // Not on top of a session or report: finishing the intro clears the back stack.
            if (onBack == null) LinkRow(Res.string.settings_replay_onboarding, onReplayOnboarding)
            LinkRow(Res.string.help_link, onHelp)
            LinkRow(Res.string.settings_privacy, onPrivacy)

            if (AppConfig.isDebug) {
                Divider()
                SectionTitle(Res.string.settings_debug)
                SwitchRow(Res.string.settings_fake_api, Res.string.settings_fake_api_desc, useFakeApi, onUseFakeApiChange)
                Text(
                    AppConfig.apiBaseUrl,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
            Spacer(Modifier.height(16.dp))
            Text(
                stringResource(Res.string.settings_version, BuildKonfig.VERSION_NAME),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
            Spacer(Modifier.height(24.dp))
        }
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

@Composable
private fun Divider() = HorizontalDivider(Modifier.padding(top = 12.dp, bottom = 4.dp), color = MaterialTheme.colorScheme.outline)

@Composable
private fun SectionTitle(res: StringResource) {
    Text(
        stringResource(res),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
    )
}

@Composable
private fun ItemTitle(res: StringResource, top: androidx.compose.ui.unit.Dp = 0.dp) {
    Text(
        stringResource(res),
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = top, bottom = 4.dp),
    )
}

@Composable
private fun SwitchRow(title: StringResource, description: StringResource, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .toggleable(value = checked, onValueChange = onChange, role = Role.Switch)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(stringResource(title), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(description), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = checked, onCheckedChange = null)
    }
}

@Composable
private fun LinkRow(label: StringResource, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(label), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun LanguageRow(value: AppLanguage, label: StringResource, selected: AppLanguage, onSelect: (AppLanguage) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .selectable(selected = value == selected, onClick = { onSelect(value) }, role = Role.RadioButton)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = value == selected, onClick = null)
        Spacer(Modifier.width(16.dp))
        Text(stringResource(label), style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun InviteCodeField(saved: String, onSave: (String) -> Unit) {
    var draft by remember { mutableStateOf(saved) }
    LaunchedEffect(saved) { draft = saved }
    val dirty = draft.trim() != saved
    Column(Modifier.padding(horizontal = 16.dp)) {
        Text(
            stringResource(Res.string.settings_invite_desc),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                singleLine = true,
                shape = MaterialTheme.shapes.small,
                placeholder = { Text(stringResource(Res.string.settings_invite_hint)) },
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(12.dp))
            Button(onClick = { onSave(draft) }, enabled = dirty, shape = MaterialTheme.shapes.small) {
                Text(stringResource(if (!dirty && saved.isNotEmpty()) Res.string.settings_invite_saved else Res.string.settings_invite_save))
            }
        }
    }
}
