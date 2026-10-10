package io.novawerk.psygym.ui.pages.settings

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
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.BuildKonfig
import io.novawerk.psygym.domain.settings.AppLanguage
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.home_safety_body
import io.novawerk.psygym.resources.settings_about
import io.novawerk.psygym.resources.settings_debug
import io.novawerk.psygym.resources.settings_fake_api
import io.novawerk.psygym.resources.settings_fake_api_desc
import io.novawerk.psygym.resources.settings_invite
import io.novawerk.psygym.resources.settings_invite_desc
import io.novawerk.psygym.resources.settings_invite_hint
import io.novawerk.psygym.resources.settings_invite_save
import io.novawerk.psygym.resources.settings_invite_saved
import io.novawerk.psygym.resources.settings_language
import io.novawerk.psygym.resources.settings_language_en
import io.novawerk.psygym.resources.settings_language_system
import io.novawerk.psygym.resources.settings_language_zh
import io.novawerk.psygym.resources.settings_title
import io.novawerk.psygym.resources.settings_version
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    language: AppLanguage,
    inviteCode: String,
    useFakeApi: Boolean,
    onLanguageChange: (AppLanguage) -> Unit,
    onInviteCodeSave: (String) -> Unit,
    onUseFakeApiChange: (Boolean) -> Unit,
    onBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            SectionTitle(Res.string.settings_language)
            Column(Modifier.selectableGroup()) {
                LanguageRow(AppLanguage.System, Res.string.settings_language_system, language, onLanguageChange)
                LanguageRow(AppLanguage.Zh, Res.string.settings_language_zh, language, onLanguageChange)
                LanguageRow(AppLanguage.En, Res.string.settings_language_en, language, onLanguageChange)
            }

            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            SectionTitle(Res.string.settings_invite)
            InviteCodeField(inviteCode, onInviteCodeSave)

            if (BuildKonfig.IS_DEBUG) {
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                SectionTitle(Res.string.settings_debug)
                ListItem(
                    headlineContent = { Text(stringResource(Res.string.settings_fake_api)) },
                    supportingContent = { Text(stringResource(Res.string.settings_fake_api_desc)) },
                    trailingContent = { Switch(checked = useFakeApi, onCheckedChange = null) },
                    colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.background),
                    modifier = Modifier.toggleable(
                        value = useFakeApi,
                        onValueChange = onUseFakeApiChange,
                        role = Role.Switch,
                    ),
                )
                Text(
                    BuildKonfig.API_BASE_URL,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }

            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            SectionTitle(Res.string.settings_about)
            Text(
                stringResource(Res.string.home_safety_body),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(Res.string.settings_version, BuildKonfig.VERSION_NAME),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun SectionTitle(res: StringResource) {
    Text(
        stringResource(res),
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
    )
}

@Composable
private fun LanguageRow(
    value: AppLanguage,
    label: StringResource,
    selected: AppLanguage,
    onSelect: (AppLanguage) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .selectable(selected = value == selected, onClick = { onSelect(value) }, role = Role.RadioButton)
            .padding(horizontal = 16.dp, vertical = 10.dp),
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
                placeholder = { Text(stringResource(Res.string.settings_invite_hint)) },
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(12.dp))
            Button(onClick = { onSave(draft) }, enabled = dirty) {
                Text(
                    stringResource(
                        if (!dirty && saved.isNotEmpty()) Res.string.settings_invite_saved else Res.string.settings_invite_save,
                    ),
                )
            }
        }
    }
}
