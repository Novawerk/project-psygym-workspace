package io.novawerk.psygym.ui.pages.briefing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.brief_client
import io.novawerk.psygym.resources.brief_content_note
import io.novawerk.psygym.resources.brief_focus
import io.novawerk.psygym.resources.brief_session_first_note
import io.novawerk.psygym.resources.brief_setup
import io.novawerk.psygym.resources.brief_setup_body
import io.novawerk.psygym.resources.brief_start
import io.novawerk.psygym.ui.components.BorderedCard
import io.novawerk.psygym.ui.components.BottomActions
import io.novawerk.psygym.ui.components.CaseAvatar
import io.novawerk.psygym.ui.components.CaseTags
import io.novawerk.psygym.ui.components.displayTitle
import io.novawerk.psygym.ui.components.HelpLink
import io.novawerk.psygym.ui.components.PrimaryButton
import io.novawerk.psygym.ui.components.SafetyNote
import io.novawerk.psygym.ui.locale.rememberApiLocale
import org.jetbrains.compose.resources.stringResource

/**
 * C2 · Case brief: who the client is, the session setup, and the content note before
 * every session (acceptance A3/E2/G6). Without the D2 case fields, "The client" shows
 * the summary and "What to practise" is left out.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BriefingScreen(
    case: CaseSummary?,
    caseIndex: Int,
    onStart: () -> Unit,
    onBack: () -> Unit,
    onHelp: () -> Unit,
    onSessionLost: () -> Unit,
) {
    LaunchedEffect(Unit) { if (case == null) onSessionLost() }
    if (case == null) return
    val locale = rememberApiLocale()
    val scroll = rememberScrollState()
    // The title appears in the top bar once the header has scrolled away.
    val showTitle by remember { derivedStateOf { scroll.value > 120 } }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (showTitle) Text(case.displayTitle(locale), maxLines = 1, overflow = TextOverflow.Ellipsis)
                },
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
                PrimaryButton(stringResource(Res.string.brief_start), onStart)
                HelpLink(onHelp)
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                CaseAvatar(case, caseIndex, locale, size = 52.dp)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(case.displayTitle(locale), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    CaseTags(case, locale, firstSession = true)
                }
            }
            Section(stringResource(Res.string.brief_client), (case.clientIntro ?: case.summary).get(locale))
            // What a first session is for, above "What to practise" (S-1, copy.md).
            Text(
                stringResource(Res.string.brief_session_first_note),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (case.practiceFocus.isNotEmpty()) {
                BorderedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(Res.string.brief_focus), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        case.practiceFocus.forEach { focus ->
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                                Text(focus.get(locale), style = MaterialTheme.typography.bodyLarge)
                            }
                        }
                    }
                }
            }
            Section(stringResource(Res.string.brief_setup), stringResource(Res.string.brief_setup_body))
            SafetyNote {
                Text(
                    case.contentNotes?.get(locale) ?: stringResource(Res.string.brief_content_note),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun Section(title: String, body: String) {
    BorderedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(body, style = MaterialTheme.typography.bodyLarge)
        }
    }
}
