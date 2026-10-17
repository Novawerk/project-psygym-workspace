package io.novawerk.psygym.ui.pages.home

import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import io.novawerk.psygym.resources.practice_lost
import androidx.compose.foundation.layout.Arrangement
import io.novawerk.psygym.resources.help_link
import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.app_name
import io.novawerk.psygym.resources.home_cases_all
import io.novawerk.psygym.resources.home_cases_section
import io.novawerk.psygym.resources.home_disclaimer
import io.novawerk.psygym.resources.home_greeting
import io.novawerk.psygym.resources.home_start_card_button
import io.novawerk.psygym.resources.home_start_card_meta
import io.novawerk.psygym.resources.home_start_card_title
import io.novawerk.psygym.resources.home_tagline
import io.novawerk.psygym.ui.components.LogoMark
import io.novawerk.psygym.ui.components.BottomBar
import io.novawerk.psygym.ui.components.CaseCard
import io.novawerk.psygym.ui.components.TopTab
import io.novawerk.psygym.ui.components.CaseCardSkeleton
import io.novawerk.psygym.ui.components.DemoBadge
import io.novawerk.psygym.ui.components.ErrorCard
import io.novawerk.psygym.ui.components.SafetyNote
import io.novawerk.psygym.ui.locale.rememberApiLocale
import org.jetbrains.compose.resources.stringResource

/** H1 · Home. One look says what this is; one tap starts practice. Settings live under Me. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    demoData: Boolean,
    cases: List<CaseSummary>?,
    casesError: ApiError?,
    onStart: () -> Unit,
    onPickCase: (CaseSummary) -> Unit,
    onAllCases: () -> Unit,
    onRetryCases: () -> Unit,
    onHelp: () -> Unit,
    onTab: (TopTab) -> Unit,
    practiceLost: Boolean = false,
    onPracticeLostShown: () -> Unit = {},
) {
    val locale = rememberApiLocale()
    val snackbar = remember { SnackbarHostState() }
    val lostText = stringResource(Res.string.practice_lost)
    LaunchedEffect(practiceLost) {
        if (practiceLost) {
            // Clear only after showing: clearing first would cancel this effect.
            snackbar.showSnackbar(lostText, withDismissAction = true, duration = SnackbarDuration.Long)
            onPracticeLostShown()
        }
    }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        LogoMark()
                        Text(stringResource(Res.string.app_name), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        if (demoData) DemoBadge()
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = { BottomBar(TopTab.Practice, onTab) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            Text(stringResource(Res.string.home_greeting), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Text(stringResource(Res.string.home_tagline), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            StartCard(onStart)
            Spacer(Modifier.height(20.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(Res.string.home_cases_section), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = onAllCases) {
                    Text(stringResource(Res.string.home_cases_all), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(8.dp))
            when {
                casesError != null -> ErrorCard(casesError, onRetry = onRetryCases, casesList = true)
                cases == null -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    CaseCardSkeleton(Modifier.weight(1f))
                    CaseCardSkeleton(Modifier.weight(1f))
                }
                // Same height, content from the top, whatever each case carries (audit L).
                else -> Row(Modifier.height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    cases.take(2).forEachIndexed { i, case ->
                        CaseCard(case, i, locale, onClick = { onPickCase(case) }, modifier = Modifier.weight(1f).fillMaxHeight(), compact = true)
                    }
                    if (cases.size == 1) Spacer(Modifier.weight(1f))
                }
            }
            Spacer(Modifier.height(16.dp))
            // "Need help?" inside the safety note, as a compact link: the page ends on a whole
            // card that fits a tall phone's screen, instead of a link half under the tab bar.
            // The whole card opens X1, so the touch target is the card (well over 48dp) while the
            // card keeps its height.
            val helpLabel = stringResource(Res.string.help_link)
            SafetyNote(
                Modifier
                    .clip(MaterialTheme.shapes.large)
                    .clickable(role = Role.Button, onClickLabel = helpLabel, onClick = onHelp),
            ) {
                Text(stringResource(Res.string.home_disclaimer), style = MaterialTheme.typography.bodySmall)
                Text(
                    helpLabel,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier.padding(vertical = 2.dp),
                )
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

/** The main card: solid primary ground, one button into the case library. */
@Composable
private fun StartCard(onStart: () -> Unit) {
    Card(
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(stringResource(Res.string.home_start_card_title), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(
                stringResource(Res.string.home_start_card_meta),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.75f),
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onStart,
                shape = MaterialTheme.shapes.small,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.onPrimary,
                    contentColor = MaterialTheme.colorScheme.primary,
                ),
            ) { Text(stringResource(Res.string.home_start_card_button)) }
        }
    }
}
