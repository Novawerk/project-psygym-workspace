package io.novawerk.psygym.ui.pages.history

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.history.Course
import io.novawerk.psygym.domain.history.SavedSession
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.practice.SessionPlan
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.history_cancel
import io.novawerk.psygym.resources.history_delete
import io.novawerk.psygym.resources.history_delete_one
import io.novawerk.psygym.resources.history_delete_one_confirm
import io.novawerk.psygym.resources.history_detail_chat
import io.novawerk.psygym.resources.history_detail_report
import io.novawerk.psygym.resources.history_no_report
import io.novawerk.psygym.resources.history_continue
import io.novawerk.psygym.resources.history_course
import io.novawerk.psygym.resources.history_detail_summary
import io.novawerk.psygym.resources.history_session_n
import io.novawerk.psygym.resources.history_summary_none
import io.novawerk.psygym.resources.history_summary_note
import io.novawerk.psygym.resources.supervision_again
import io.novawerk.psygym.ui.components.ReportView
import io.novawerk.psygym.ui.components.PillToggle
import io.novawerk.psygym.ui.components.BorderedCard
import io.novawerk.psygym.ui.components.BottomActions
import io.novawerk.psygym.ui.components.PrimaryButton
import io.novawerk.psygym.ui.components.displayTitle
import io.novawerk.psygym.ui.locale.rememberApiLocale
import io.novawerk.psygym.ui.pages.practice.Bubble
import io.novawerk.psygym.ui.pages.practice.ChatItem
import org.jetbrains.compose.resources.stringResource

/** M2 · One saved session: report and conversation side by side, read only. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryDetailScreen(
    session: SavedSession?,
    onBack: () -> Unit,
    onDelete: () -> Unit,
    onPracticeAgain: () -> Unit,
    /** The sessions with this client (docs/decisions/0014); null or one session: no list. */
    course: Course? = null,
    /** The course's next session, when the case has one left. */
    next: SessionPlan? = null,
    onContinue: (SessionPlan) -> Unit = {},
    onOpen: (String) -> Unit = {},
) {
    // Deleted elsewhere, or gone: nothing to show.
    LaunchedEffect(session) { if (session == null) onBack() }
    if (session == null) return
    val locale = rememberApiLocale()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var confirmDelete by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(session.case.displayTitle(locale), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val numbered = session.sessionNumber > 1 || (course?.sessions?.size ?: 0) > 1
                        val meta = sessionMeta(session, locale)
                        Text(
                            if (numbered) "${stringResource(Res.string.history_session_n, session.sessionNumber)} · $meta" else meta,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                    }
                },
                actions = {
                    IconButton(onClick = { confirmDelete = true }) {
                        Icon(Icons.Outlined.Delete, contentDescription = stringResource(Res.string.history_delete_one))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            BottomActions {
                if (next != null) {
                    PrimaryButton(stringResource(Res.string.history_continue, next.number), { onContinue(next) })
                } else {
                    PrimaryButton(stringResource(Res.string.supervision_again), onPracticeAgain)
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            // The summary tab only where sessions follow on: older records have none.
            val inCourse = session.summary.isNotBlank() || session.sessionNumber > 1 || (course?.sessions?.size ?: 0) > 1
            val labels = listOfNotNull(Res.string.history_detail_report, Res.string.history_detail_chat, Res.string.history_detail_summary.takeIf { inCourse })
            // Pill toggle: the chosen one white and bold on a light grey track (design M2, audit M).
            PillToggle(
                options = labels.mapIndexed { i, label -> i to stringResource(label) },
                selected = tab,
                onSelect = { tab = it },
                fill = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
            )
            if (tab == 0) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp)) {
                    if (session.report.isBlank()) {
                        Text(stringResource(Res.string.history_no_report), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        ReportView(session.report, Modifier.fillMaxWidth())
                    }
                }
            } else if (tab == 1) {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(session.messages) { Bubble(ChatItem(it)) }
                }
            } else {
                SummaryTab(session, course, locale, onOpen)
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            text = { Text(stringResource(Res.string.history_delete_one_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onDelete()
                }) { Text(stringResource(Res.string.history_delete), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(Res.string.history_cancel)) } },
        )
    }
}

/** The note kept for the next session, and the sessions with this client in order. */
@Composable
private fun SummaryTab(session: SavedSession, course: Course?, locale: ApiLocale, onOpen: (String) -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (session.summary.isBlank()) {
            Text(stringResource(Res.string.history_summary_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            ReportView(session.summary, Modifier.fillMaxWidth())
            Text(
                stringResource(Res.string.history_summary_note),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        val sessions = course?.sessions.orEmpty()
        if (sessions.size > 1) {
            Text(stringResource(Res.string.history_course), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            BorderedCard(Modifier.fillMaxWidth()) {
                Column {
                    sessions.forEach { s ->
                        val current = s.id == session.id
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !current) { onOpen(s.id) }
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                stringResource(Res.string.history_session_n, s.sessionNumber),
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal,
                            )
                            Text(
                                sessionMeta(s, locale),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }
    }
}
