package io.novawerk.psygym.ui.pages.supervision

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
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Support
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.unit.dp
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.m3.markdownTypography
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.practice_help_cd
import io.novawerk.psygym.resources.supervision_again
import io.novawerk.psygym.resources.supervision_generating
import io.novawerk.psygym.resources.supervision_home
import io.novawerk.psygym.resources.supervision_leave_body
import io.novawerk.psygym.resources.supervision_leave_cancel
import io.novawerk.psygym.resources.supervision_leave_confirm
import io.novawerk.psygym.resources.supervision_leave_title
import io.novawerk.psygym.resources.supervision_leave_writing
import io.novawerk.psygym.resources.supervision_meta
import io.novawerk.psygym.resources.supervision_other_case
import io.novawerk.psygym.resources.supervision_still_writing
import io.novawerk.psygym.resources.supervision_title
import io.novawerk.psygym.ui.components.BorderedCard
import io.novawerk.psygym.ui.components.BottomActions
import io.novawerk.psygym.ui.components.DemoBadge
import io.novawerk.psygym.ui.components.ErrorCard
import io.novawerk.psygym.ui.components.displayTitle
import io.novawerk.psygym.ui.components.PrimaryButton
import io.novawerk.psygym.ui.components.SecondaryButton
import io.novawerk.psygym.ui.locale.rememberApiLocale
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import io.novawerk.psygym.resources.turns_count
import org.jetbrains.compose.resources.pluralStringResource
import org.jetbrains.compose.resources.stringResource
import kotlin.time.Instant

/**
 * R1 · Supervision report. Plain Markdown for now (batch 2 styles quotes and
 * alternatives). The backend writes the closing "AI-generated" line (C7); the app adds none.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class)
@Composable
fun SupervisionScreen(
    viewModel: SupervisionViewModel,
    demoData: Boolean,
    onShown: () -> Unit,
    onHome: () -> Unit,
    onPracticeAgain: () -> Unit,
    onOtherCase: () -> Unit,
    onSessionLost: () -> Unit,
    onHelp: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val locale = rememberApiLocale()
    LaunchedEffect(Unit) {
        // The app was restarted and the practice is gone: nothing to report on.
        if (viewModel.hasPractice) {
            viewModel.start(locale)
            onShown()
        } else {
            onSessionLost()
        }
    }
    var confirmHome by rememberSaveable { mutableStateOf(false) }
    // Home, after a confirmation when leaving would lose the report.
    val leave = {
        if (viewModel.leaveNeedsConfirm) {
            confirmHome = true
        } else {
            onHome()
        }
    }
    // No back arrow; back = home.
    BackHandler { leave() }
    val scroll = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.supervision_title)) },
                actions = {
                    if (demoData) DemoBadge()
                    IconButton(onClick = onHelp) {
                        Icon(Icons.Outlined.Support, contentDescription = stringResource(Res.string.practice_help_cd))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            BottomActions {
                if (!viewModel.streaming) {
                    PrimaryButton(stringResource(Res.string.supervision_again), onPracticeAgain)
                    SecondaryButton(stringResource(Res.string.supervision_other_case), onOtherCase)
                }
                TextButton(onClick = leave) {
                    Text(stringResource(Res.string.supervision_home), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(horizontal = 20.dp, vertical = 8.dp),
        ) {
            viewModel.case?.let { case ->
                Text(case.displayTitle(locale), style = MaterialTheme.typography.titleMedium)
                Text(
                    stringResource(
                        Res.string.supervision_meta,
                        viewModel.startedAt?.formatDate(locale).orEmpty(),
                        viewModel.duration.inWholeMinutes.toInt().coerceAtLeast(1),
                        pluralStringResource(Res.plurals.turns_count, viewModel.turns, viewModel.turns),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(16.dp))
            }
            if (viewModel.streaming && viewModel.report.isEmpty()) {
                BorderedCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        Text(stringResource(Res.string.supervision_generating), style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            if (viewModel.report.isNotEmpty()) {
                val type = MaterialTheme.typography
                // Long press selects and copies (screens.md R1).
                SelectionContainer {
                    Markdown(
                        content = viewModel.report,
                        typography = markdownTypography(
                            h1 = type.headlineSmall,
                            h2 = type.titleLarge,
                            h3 = type.titleMedium,
                            h4 = type.titleSmall,
                            text = type.bodyLarge,
                            paragraph = type.bodyLarge,
                            bullet = type.bodyLarge,
                            list = type.bodyLarge,
                            ordered = type.bodyLarge,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                // Until the report ends, say it's still being written (audit D): real reports
                // take tens of seconds and can pause mid-way.
                if (viewModel.streaming) {
                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        Text(
                            stringResource(Res.string.supervision_still_writing),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            viewModel.error?.let { error ->
                Spacer(Modifier.height(12.dp))
                ErrorCard(
                    error = error,
                    onRetry = { viewModel.load(locale) },
                    onOpenSettings = onOpenSettings,
                    onOtherCase = onOtherCase,
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (confirmHome) {
        AlertDialog(
            onDismissRequest = { confirmHome = false },
            title = { Text(stringResource(Res.string.supervision_leave_title)) },
            text = {
                Text(stringResource(if (viewModel.streaming) Res.string.supervision_leave_writing else Res.string.supervision_leave_body))
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmHome = false
                    onHome()
                }) { Text(stringResource(Res.string.supervision_leave_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmHome = false }) { Text(stringResource(Res.string.supervision_leave_cancel)) }
            },
        )
    }
}

private val EN_MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

private fun Instant.formatDate(locale: ApiLocale): String {
    val date = toLocalDateTime(TimeZone.currentSystemDefault()).date
    return when (locale) {
        ApiLocale.Zh -> "${date.month.ordinal + 1}月${date.day}日"
        ApiLocale.En -> "${date.day} ${EN_MONTHS[date.month.ordinal]}"
    }
}
