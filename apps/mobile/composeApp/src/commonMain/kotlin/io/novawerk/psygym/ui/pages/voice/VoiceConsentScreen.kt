package io.novawerk.psygym.ui.pages.voice

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.voice.VoiceCall
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.help_link
import io.novawerk.psygym.resources.onb_link_privacy
import io.novawerk.psygym.resources.privacy_vendor
import io.novawerk.psygym.resources.voice_consent_1_body
import io.novawerk.psygym.resources.voice_consent_1_label
import io.novawerk.psygym.resources.voice_consent_1_title
import io.novawerk.psygym.resources.voice_consent_2_body
import io.novawerk.psygym.resources.voice_consent_2_label
import io.novawerk.psygym.resources.voice_consent_2_title
import io.novawerk.psygym.resources.voice_consent_3_body
import io.novawerk.psygym.resources.voice_consent_3_label
import io.novawerk.psygym.resources.voice_consent_3_title
import io.novawerk.psygym.resources.voice_consent_4_body
import io.novawerk.psygym.resources.voice_consent_4_label
import io.novawerk.psygym.resources.voice_consent_4_title
import io.novawerk.psygym.resources.voice_consent_5_body
import io.novawerk.psygym.resources.voice_consent_5_title
import io.novawerk.psygym.resources.voice_consent_accept
import io.novawerk.psygym.resources.voice_consent_check
import io.novawerk.psygym.resources.voice_consent_title
import io.novawerk.psygym.resources.voice_use_text
import io.novawerk.psygym.ui.components.GrayCard
import io.novawerk.psygym.ui.components.PrimaryButton
import io.novawerk.psygym.ui.components.SecondaryButton
import io.novawerk.psygym.ui.components.UnderlinedLink
import org.jetbrains.compose.resources.stringResource

/**
 * V1 · Before a first voice session: who gets the voice, where it goes, how long it's kept, how
 * to withdraw. GDPR article 7 and Apple 5.1.2(i): a separate page, the box starts empty, saying
 * no costs nothing. Hold to talk keeps the voice on the phone, so O2 doesn't cover this.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceConsentScreen(
    call: VoiceCall,
    onAccepted: () -> Unit,
    onGo: () -> Unit,
    onTypeInstead: () -> Unit,
    onBack: () -> Unit,
    onPrivacy: () -> Unit,
    onHelp: () -> Unit,
) {
    var checked by rememberSaveable { mutableStateOf(false) }
    val askMic = rememberMicGate(call, onGo, onTypeInstead)
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
            Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 12.dp)) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .toggleable(value = checked, onValueChange = { checked = it }, role = Role.Checkbox)
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = checked, onCheckedChange = null)
                    Spacer(Modifier.width(12.dp))
                    Text(stringResource(Res.string.voice_consent_check), style = MaterialTheme.typography.bodyMedium)
                }
                PrimaryButton(
                    stringResource(Res.string.voice_consent_accept),
                    {
                        onAccepted()
                        askMic()
                    },
                    enabled = checked,
                )
                Spacer(Modifier.height(8.dp))
                SecondaryButton(stringResource(Res.string.voice_use_text), onTypeInstead)
                Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
                    UnderlinedLink(stringResource(Res.string.onb_link_privacy), onPrivacy)
                    UnderlinedLink(stringResource(Res.string.help_link), onHelp)
                }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(stringResource(Res.string.voice_consent_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Fact(
                stringResource(Res.string.voice_consent_1_label),
                stringResource(Res.string.voice_consent_1_title),
                stringResource(Res.string.voice_consent_1_body, stringResource(Res.string.privacy_vendor)),
            )
            Fact(stringResource(Res.string.voice_consent_2_label), stringResource(Res.string.voice_consent_2_title), stringResource(Res.string.voice_consent_2_body))
            Fact(stringResource(Res.string.voice_consent_3_label), stringResource(Res.string.voice_consent_3_title), stringResource(Res.string.voice_consent_3_body))
            Fact(stringResource(Res.string.voice_consent_4_label), stringResource(Res.string.voice_consent_4_title), stringResource(Res.string.voice_consent_4_body))
            Fact(null, stringResource(Res.string.voice_consent_5_title), stringResource(Res.string.voice_consent_5_body))
        }
    }
}

@Composable
private fun Fact(label: String?, title: String, body: String) {
    GrayCard {
        if (label != null) Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(title, style = MaterialTheme.typography.titleSmall)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
