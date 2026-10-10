package io.novawerk.psygym.ui.pages.history

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.history.SavedSession
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.history_cancel
import io.novawerk.psygym.resources.history_delete
import io.novawerk.psygym.resources.history_delete_one_confirm
import io.novawerk.psygym.resources.history_empty
import io.novawerk.psygym.resources.history_empty_action
import io.novawerk.psygym.resources.history_group_earlier
import io.novawerk.psygym.resources.history_group_today
import io.novawerk.psygym.resources.history_group_week
import io.novawerk.psygym.resources.history_local_note
import io.novawerk.psygym.resources.history_next
import io.novawerk.psygym.resources.history_report_unfinished
import io.novawerk.psygym.resources.history_title
import io.novawerk.psygym.ui.components.BottomBar
import io.novawerk.psygym.ui.components.PrimaryButton
import io.novawerk.psygym.ui.components.TopTab
import io.novawerk.psygym.ui.components.displayTitle
import io.novawerk.psygym.ui.locale.rememberApiLocale
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource
import kotlin.time.Clock
import kotlin.time.Instant

/** M1 · Practice history. Top level, with the bottom bar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    sessions: List<SavedSession>?,
    onOpen: (SavedSession) -> Unit,
    onDelete: (SavedSession) -> Unit,
    onStartPractice: () -> Unit,
    onTab: (TopTab) -> Unit,
) {
    val locale = rememberApiLocale()
    var pendingDelete by rememberSaveable { mutableStateOf<String?>(null) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.history_title)) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = { BottomBar(TopTab.History, onTab) },
    ) { padding ->
        when {
            sessions == null -> Unit
            sessions.isEmpty() -> EmptyHistory(onStartPractice, Modifier.padding(padding))
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(bottom = 16.dp),
            ) {
                item {
                    Text(
                        stringResource(Res.string.history_local_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    )
                }
                groupByDay(sessions).forEach { (group, items) ->
                    item(key = group.name) {
                        Text(
                            stringResource(group.label),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 6.dp),
                        )
                    }
                    items(items, key = { it.id }) { session ->
                        SwipeRow(session, locale, onOpen = { onOpen(session) }, onSwiped = { pendingDelete = session.id })
                    }
                }
            }
        }
    }

    pendingDelete?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            text = { Text(stringResource(Res.string.history_delete_one_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    sessions?.firstOrNull { it.id == id }?.let(onDelete)
                }) { Text(stringResource(Res.string.history_delete), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text(stringResource(Res.string.history_cancel)) } },
        )
    }
}

/** Swipe left to delete (with a confirm). The row snaps back until the user confirms. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeRow(session: SavedSession, locale: ApiLocale, onOpen: () -> Unit, onSwiped: () -> Unit) {
    val state = rememberSwipeToDismissBoxState()
    LaunchedEffect(state.currentValue) {
        if (state.currentValue == SwipeToDismissBoxValue.EndToStart) {
            onSwiped()
            state.reset()
        }
    }
    SwipeToDismissBox(
        state = state,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            Box(
                Modifier.fillMaxSize().background(MaterialTheme.colorScheme.errorContainer).padding(horizontal = 24.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Icon(Icons.Outlined.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer)
            }
        },
    ) {
        HistoryRow(session, locale, onOpen)
    }
}

@Composable
private fun HistoryRow(session: SavedSession, locale: ApiLocale, onClick: () -> Unit) {
    androidx.compose.material3.Surface(onClick = onClick, color = MaterialTheme.colorScheme.background) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(session.case.displayTitle(locale), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    sessionMeta(session, locale),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                nextPractice(session.report)?.let {
                    Text(
                        stringResource(Res.string.history_next, it),
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (!session.reportComplete) {
                Spacer(Modifier.size(8.dp))
                Text(
                    stringResource(Res.string.history_report_unfinished),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun EmptyHistory(onStart: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Outlined.Description, contentDescription = null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        Text(
            stringResource(Res.string.history_empty),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        PrimaryButton(stringResource(Res.string.history_empty_action), onStart)
    }
}

private enum class DayGroup(val label: StringResource) {
    Today(Res.string.history_group_today),
    ThisWeek(Res.string.history_group_week),
    Earlier(Res.string.history_group_earlier),
}

private fun groupByDay(sessions: List<SavedSession>): List<Pair<DayGroup, List<SavedSession>>> {
    val zone = TimeZone.currentSystemDefault()
    val today = Clock.System.todayIn(zone)
    val weekStart = today.minus(DatePeriod(days = today.dayOfWeek.ordinal - DayOfWeek.MONDAY.ordinal))
    return sessions.groupBy {
        val day = Instant.fromEpochMilliseconds(it.startedAtMillis).toLocalDateTime(zone).date
        when {
            day == today -> DayGroup.Today
            day >= weekStart -> DayGroup.ThisWeek
            else -> DayGroup.Earlier
        }
    }.toList().sortedBy { it.first.ordinal }
}

/** The first item under "What to practise next" / 「下次练什么」, if the report has one. */
internal fun nextPractice(report: String): String? {
    val lines = report.lines()
    val start = lines.indexOfFirst { it.startsWith("#") && (it.contains("下次练") || it.contains("practise next", ignoreCase = true)) }
    if (start < 0) return null
    return lines.drop(start + 1)
        .takeWhile { !it.startsWith("#") }
        .map { it.trim() }
        .firstOrNull { it.startsWith("- ") || it.startsWith("* ") || it.matches(Regex("""\d+[.)]\s.*""")) }
        ?.replace(Regex("""^([-*]|\d+[.)])\s+"""), "")
        ?.replace("**", "")
}
