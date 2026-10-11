package io.novawerk.psygym.ui.pages.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
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
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.m3.markdownTypography
import io.novawerk.psygym.domain.history.SavedSession
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.history_cancel
import io.novawerk.psygym.resources.history_delete
import io.novawerk.psygym.resources.history_delete_one
import io.novawerk.psygym.resources.history_delete_one_confirm
import io.novawerk.psygym.resources.history_detail_chat
import io.novawerk.psygym.resources.history_detail_report
import io.novawerk.psygym.resources.history_no_report
import io.novawerk.psygym.resources.supervision_again
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
                        Text(sessionMeta(session, locale), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
        bottomBar = { BottomActions { PrimaryButton(stringResource(Res.string.supervision_again), onPracticeAgain) } },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            val labels = listOf(Res.string.history_detail_report, Res.string.history_detail_chat)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
                labels.forEachIndexed { i, label ->
                    SegmentedButton(
                        selected = tab == i,
                        onClick = { tab = i },
                        shape = SegmentedButtonDefaults.itemShape(i, labels.size),
                        // Selected = white (the page colour) and bold on a muted track, light
                        // border (design M2, audit M).
                        colors = SegmentedButtonDefaults.colors(
                            activeContainerColor = MaterialTheme.colorScheme.background,
                            activeContentColor = MaterialTheme.colorScheme.onSurface,
                            inactiveContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            inactiveContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            activeBorderColor = MaterialTheme.colorScheme.outline,
                            inactiveBorderColor = MaterialTheme.colorScheme.outline,
                        ),
                        icon = {},
                    ) {
                        Text(
                            stringResource(label),
                            fontWeight = if (tab == i) FontWeight.SemiBold else FontWeight.Normal,
                        )
                    }
                }
            }
            if (tab == 0) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp)) {
                    if (session.report.isBlank()) {
                        Text(stringResource(Res.string.history_no_report), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        val type = MaterialTheme.typography
                        SelectionContainer {
                            Markdown(
                                content = session.report,
                                typography = markdownTypography(
                                    h1 = type.headlineSmall, h2 = type.titleLarge, h3 = type.titleMedium, h4 = type.titleSmall,
                                    text = type.bodyLarge, paragraph = type.bodyLarge, bullet = type.bodyLarge, list = type.bodyLarge, ordered = type.bodyLarge,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(session.messages) { Bubble(ChatItem(it)) }
                }
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
