package io.novawerk.psygym.ui.pages.briefing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.briefing_1
import io.novawerk.psygym.resources.briefing_2
import io.novawerk.psygym.resources.briefing_3
import io.novawerk.psygym.resources.briefing_4
import io.novawerk.psygym.resources.briefing_5
import io.novawerk.psygym.resources.briefing_ok
import io.novawerk.psygym.resources.briefing_title
import io.novawerk.psygym.ui.locale.rememberApiLocale
import org.jetbrains.compose.resources.stringResource

/**
 * The case, then the full notice (docs/safety.md §5, acceptance A3/E2). Only
 * "I understand" leads into the session. A page of its own so it can grow into the
 * case intro page later.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BriefingScreen(
    case: CaseSummary?,
    onAccept: () -> Unit,
    onBack: () -> Unit,
    onSessionLost: () -> Unit,
) {
    LaunchedEffect(Unit) { if (case == null) onSessionLost() }
    val locale = rememberApiLocale()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.briefing_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
                Button(
                    onClick = onAccept,
                    enabled = case != null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                        .height(52.dp),
                ) { Text(stringResource(Res.string.briefing_ok), style = MaterialTheme.typography.titleMedium) }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            if (case != null) {
                Text(case.title.get(locale), style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.height(8.dp))
                Text(
                    case.summary.get(locale),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(24.dp))
            }
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
            ) {
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    Icon(Icons.Outlined.Shield, contentDescription = null)
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        listOf(Res.string.briefing_1, Res.string.briefing_2, Res.string.briefing_3, Res.string.briefing_4, Res.string.briefing_5)
                            .forEach { Text(stringResource(it), style = MaterialTheme.typography.bodyMedium) }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
