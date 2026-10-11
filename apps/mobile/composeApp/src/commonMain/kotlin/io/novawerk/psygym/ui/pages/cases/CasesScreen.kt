package io.novawerk.psygym.ui.pages.cases

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.cases_empty
import io.novawerk.psygym.resources.cases_intro
import io.novawerk.psygym.resources.cases_more
import io.novawerk.psygym.resources.cases_title
import io.novawerk.psygym.ui.components.CaseCard
import io.novawerk.psygym.ui.components.CaseCardSkeleton
import io.novawerk.psygym.ui.components.DemoBadge
import io.novawerk.psygym.ui.components.ErrorCard
import io.novawerk.psygym.ui.locale.rememberApiLocale
import org.jetbrains.compose.resources.stringResource

/** C1 · Case library. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CasesScreen(
    cases: List<CaseSummary>?,
    error: ApiError?,
    demoData: Boolean,
    onBack: () -> Unit,
    onPick: (CaseSummary) -> Unit,
    onRetry: () -> Unit,
) {
    val locale = rememberApiLocale()
    Scaffold(
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
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    stringResource(Res.string.cases_intro),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            when {
                error != null -> item { ErrorCard(error, onRetry = onRetry, casesList = true) }
                cases == null -> items(3) { CaseCardSkeleton(Modifier.fillMaxWidth()) }
                cases.isEmpty() -> item {
                    Text(
                        stringResource(Res.string.cases_empty),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                    )
                }
                else -> {
                    itemsIndexed(cases, key = { _, c -> c.id }) { i, case ->
                        CaseCard(case, i, locale, onClick = { onPick(case) }, modifier = Modifier.fillMaxWidth())
                    }
                    item {
                        Text(
                            stringResource(Res.string.cases_more),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                        )
                    }
                }
            }
        }
    }
}

