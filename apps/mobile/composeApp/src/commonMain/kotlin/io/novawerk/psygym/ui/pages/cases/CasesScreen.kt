package io.novawerk.psygym.ui.pages.cases

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.cases_empty
import io.novawerk.psygym.resources.cases_school_cbt
import io.novawerk.psygym.resources.cases_title
import io.novawerk.psygym.resources.practice_interrupted
import io.novawerk.psygym.ui.components.DemoBadge
import io.novawerk.psygym.ui.components.ErrorCard
import io.novawerk.psygym.ui.locale.rememberApiLocale
import org.jetbrains.compose.resources.stringResource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CasesScreen(
    viewModel: CasesViewModel,
    demoData: Boolean,
    interrupted: Boolean,
    onInterruptedShown: () -> Unit,
    onBack: () -> Unit,
    onPick: (CaseSummary) -> Unit,
    onOpenSettings: () -> Unit,
) {
    val locale = rememberApiLocale()
    val snackbar = remember { SnackbarHostState() }
    val interruptedText = stringResource(Res.string.practice_interrupted)
    LaunchedEffect(interrupted) {
        if (interrupted) {
            // Clear the flag only after showing: clearing first would cancel this effect.
            snackbar.showSnackbar(interruptedText, withDismissAction = true, duration = SnackbarDuration.Long)
            onInterruptedShown()
        }
    }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.cases_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                    }
                },
                actions = { if (demoData) DemoBadge(Modifier.padding(end = 12.dp)) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            val cases = viewModel.cases
            val error = viewModel.error
            when {
                error != null -> ErrorCard(
                    error = error,
                    onRetry = viewModel::load,
                    onOpenSettings = onOpenSettings,
                    modifier = Modifier.padding(16.dp),
                )
                cases == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                cases.isEmpty() -> Text(
                    stringResource(Res.string.cases_empty),
                    modifier = Modifier.align(Alignment.Center),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(cases, key = { it.id }) { case ->
                        CaseCard(case, locale, onClick = { onPick(case) })
                    }
                }
            }
        }
    }
}

@Composable
private fun CaseCard(case: CaseSummary, locale: ApiLocale, onClick: () -> Unit) {
    ElevatedCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(case.title.get(locale), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(6.dp))
            Text(
                case.summary.get(locale),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (case.school == "cbt") {
                Spacer(Modifier.height(8.dp))
                AssistChip(onClick = onClick, label = { Text(stringResource(Res.string.cases_school_cbt)) })
            }
        }
    }
}
