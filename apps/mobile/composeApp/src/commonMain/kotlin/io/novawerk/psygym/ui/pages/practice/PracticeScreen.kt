package io.novawerk.psygym.ui.pages.practice

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.outlined.Support
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.model.ContractLimits
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.practice_chars_left
import io.novawerk.psygym.resources.practice_client_ended
import io.novawerk.psygym.resources.practice_empty
import io.novawerk.psygym.resources.practice_end
import io.novawerk.psygym.resources.practice_end_body
import io.novawerk.psygym.resources.practice_end_body_short
import io.novawerk.psygym.resources.practice_end_cancel
import io.novawerk.psygym.resources.practice_end_cd
import io.novawerk.psygym.resources.practice_end_confirm
import io.novawerk.psygym.resources.practice_end_note
import io.novawerk.psygym.resources.practice_end_note_off
import io.novawerk.psygym.resources.practice_end_title
import io.novawerk.psygym.resources.practice_help_cd
import io.novawerk.psygym.resources.practice_incomplete
import io.novawerk.psygym.resources.practice_input_hint
import io.novawerk.psygym.resources.practice_leave_body
import io.novawerk.psygym.resources.practice_leave_cancel
import io.novawerk.psygym.resources.practice_leave_confirm
import io.novawerk.psygym.resources.practice_leave_title
import io.novawerk.psygym.resources.practice_limit_reached
import io.novawerk.psygym.resources.practice_meta
import io.novawerk.psygym.resources.practice_meta_turns
import io.novawerk.psygym.resources.practice_near_limit
import io.novawerk.psygym.resources.practice_real_info_hint
import io.novawerk.psygym.resources.practice_role_client
import io.novawerk.psygym.resources.practice_role_counselor
import io.novawerk.psygym.resources.practice_send
import io.novawerk.psygym.resources.practice_timer_cd
import io.novawerk.psygym.ui.components.BorderedCard
import io.novawerk.psygym.ui.components.ErrorCard
import io.novawerk.psygym.ui.components.PrimaryButton
import io.novawerk.psygym.ui.components.SecondaryButton
import io.novawerk.psygym.ui.locale.rememberApiLocale
import kotlinx.coroutines.delay
import org.jetbrains.compose.resources.stringResource
import kotlin.time.Duration

/** S1 · Session, with S2 (the end sheet) on top. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class)
@Composable
fun PracticeScreen(
    viewModel: PracticeViewModel,
    elapsed: () -> Duration,
    showRealInfoHint: Boolean,
    saveHistory: Boolean,
    onLeave: () -> Unit,
    onSessionLost: () -> Unit,
    onEnd: () -> Unit,
    onHelp: () -> Unit,
    onOpenSettings: () -> Unit,
    onOtherCase: () -> Unit,
) {
    val locale = rememberApiLocale()
    var input by rememberSaveable { mutableStateOf("") }
    var showEndSheet by rememberSaveable { mutableStateOf(false) }
    var showTimer by rememberSaveable { mutableStateOf(true) }
    val listState = rememberLazyListState()
    val items = viewModel.items
    val lastText = items.lastOrNull()?.message?.text

    // The app was restarted and the in-memory practice is gone: back to the case list.
    LaunchedEffect(Unit) { if (viewModel.case == null) onSessionLost() }

    // Follow the conversation, including each new piece of a streaming reply.
    LaunchedEffect(items.size, lastText?.length, viewModel.error, viewModel.clientEnded) {
        val count = listState.layoutInfo.totalItemsCount
        if (count > 0) listState.animateScrollToItem(count - 1)
    }

    // Back opens S2 instead of leaving (information-architecture.md). While S2 is open,
    // back belongs to the sheet, so it closes.
    BackHandler(enabled = !showEndSheet) { showEndSheet = true }

    val clock by produceState("00:00") {
        while (true) {
            value = elapsed().format()
            delay(1_000)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column(Modifier.clickable { showTimer = !showTimer }) {
                        Text(
                            viewModel.case?.let { (it.clientAlias ?: it.title).get(locale) }.orEmpty(),
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        val timerCd = stringResource(Res.string.practice_timer_cd)
                        // No "Turn 0" before the first message: just the clock (audit K).
                        val turns = viewModel.turns
                        Text(
                            when {
                                turns == 0 -> if (showTimer) clock else ""
                                showTimer -> stringResource(Res.string.practice_meta, turns, clock)
                                else -> stringResource(Res.string.practice_meta_turns, turns)
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.semantics { contentDescription = timerCd },
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { showEndSheet = true }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                    }
                },
                actions = {
                    IconButton(onClick = onHelp) {
                        Icon(Icons.Outlined.Support, contentDescription = stringResource(Res.string.practice_help_cd))
                    }
                    if (!viewModel.clientEnded) {
                        val endCd = stringResource(Res.string.practice_end_cd)
                        TextButton(onClick = { showEndSheet = true }, modifier = Modifier.semantics { contentDescription = endCd }) {
                            Text(stringResource(Res.string.practice_end))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            when {
                viewModel.clientEnded || viewModel.atLimit -> Surface(color = MaterialTheme.colorScheme.background) {
                    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp)) {
                        PrimaryButton(stringResource(Res.string.practice_end_confirm), onEnd, enabled = !viewModel.streaming)
                    }
                }
                else -> Composer(
                    value = input,
                    onValueChange = { input = it.take(ContractLimits.MAX_MESSAGE_CHARS) },
                    enabled = viewModel.canSend,
                    sending = viewModel.streaming,
                    hint = when {
                        viewModel.nearLimit -> stringResource(Res.string.practice_near_limit)
                        showRealInfoHint -> stringResource(Res.string.practice_real_info_hint)
                        else -> null
                    },
                    onSend = {
                        viewModel.send(input, locale)
                        input = ""
                    },
                )
            }
        },
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (items.isEmpty()) {
                item {
                    BorderedCard(Modifier.fillMaxWidth()) {
                        Text(
                            stringResource(Res.string.practice_empty),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                }
            }
            itemsIndexed(items) { _, item -> Bubble(item) }
            if (viewModel.streaming && items.lastOrNull()?.message?.role == Role.Counselor) {
                item { TypingBubble() }
            }
            if (viewModel.clientEnded) {
                item { SystemLine(stringResource(Res.string.practice_client_ended)) }
            }
            viewModel.error?.let { error ->
                item {
                    ErrorCard(
                        error = error,
                        onRetry = { viewModel.retry(locale) },
                        onOpenSettings = onOpenSettings,
                        onOtherCase = onOtherCase,
                        onEndSession = { if (viewModel.canEnd) onEnd() },
                    )
                }
            }
            if (viewModel.atLimit && !viewModel.clientEnded) {
                item { SystemLine(stringResource(Res.string.practice_limit_reached)) }
            }
        }
    }

    if (showEndSheet) {
        EndSheet(
            kind = viewModel.endKind,
            saveHistory = saveHistory,
            onEnd = {
                showEndSheet = false
                onEnd()
            },
            onLeave = {
                showEndSheet = false
                onLeave()
            },
            onDismiss = { showEndSheet = false },
        )
    }
}

private fun Duration.format(): String {
    val total = inWholeSeconds
    val m = total / 60
    val s = total % 60
    return "${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}"
}

/** S2 · End sheet: three cases (screens.md). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EndSheet(kind: EndKind, saveHistory: Boolean, onEnd: () -> Unit, onLeave: () -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.background,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            val notStarted = kind == EndKind.NotStarted
            Text(
                stringResource(if (notStarted) Res.string.practice_leave_title else Res.string.practice_end_title),
                style = MaterialTheme.typography.titleLarge,
            )
            Text(
                stringResource(
                    when (kind) {
                        EndKind.NotStarted -> Res.string.practice_leave_body
                        EndKind.Short -> Res.string.practice_end_body_short
                        EndKind.Normal -> Res.string.practice_end_body
                    },
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            if (notStarted) {
                PrimaryButton(stringResource(Res.string.practice_leave_confirm), onLeave)
                SecondaryButton(stringResource(Res.string.practice_leave_cancel), onDismiss)
            } else {
                PrimaryButton(stringResource(Res.string.practice_end_confirm), onEnd)
                SecondaryButton(stringResource(Res.string.practice_end_cancel), onDismiss)
            }
            // The notice before the first save (decision 0005).
            Text(
                stringResource(if (saveHistory) Res.string.practice_end_note else Res.string.practice_end_note_off),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            )
        }
    }
}

/** A centered grey line with rules on both sides, e.g. "The client has ended the session". */
@Composable
private fun SystemLine(text: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outline)
        Text(
            text,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 12.dp).widthIn(max = 260.dp),
        )
        HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
internal fun Bubble(item: ChatItem) {
    val message = item.message
    val mine = message.role == Role.Counselor
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
    ) {
        Text(
            stringResource(if (mine) Res.string.practice_role_counselor else Res.string.practice_role_client),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
        Surface(
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (mine) 16.dp else 4.dp,
                bottomEnd = if (mine) 4.dp else 16.dp,
            ),
            color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
            contentColor = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.widthIn(max = 300.dp),
        ) {
            // Long press selects and copies (screens.md S1).
            SelectionContainer {
                Text(
                    if (item.incomplete) message.text + " " + stringResource(Res.string.practice_incomplete) else message.text,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp).alpha(if (item.incomplete) 0.6f else 1f),
                )
            }
        }
    }
}

/** Three dots while the client is about to reply. */
@Composable
private fun TypingBubble() {
    val transition = rememberInfiniteTransition()
    Row(Modifier.fillMaxWidth()) {
        Surface(
            shape = RoundedCornerShape(16.dp, 16.dp, 16.dp, 4.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                repeat(3) { i ->
                    val a by transition.animateFloat(
                        initialValue = 0.25f,
                        targetValue = 1f,
                        animationSpec = infiniteRepeatable(tween(500, delayMillis = i * 150), RepeatMode.Reverse),
                    )
                    Box(Modifier.size(7.dp).alpha(a).background(MaterialTheme.colorScheme.onSurfaceVariant, CircleShape))
                }
            }
        }
    }
}

@Composable
private fun Composer(
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean,
    sending: Boolean,
    hint: String?,
    onSend: () -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = 12.dp, vertical = 8.dp)) {
            if (hint != null) {
                Text(
                    hint,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 8.dp, bottom = 6.dp),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    enabled = enabled,
                    placeholder = { Text(stringResource(Res.string.practice_input_hint)) },
                    supportingText = (ContractLimits.MAX_MESSAGE_CHARS - value.length).takeIf { it <= CHARS_LEFT_FROM }?.let { left ->
                        { Text(stringResource(Res.string.practice_chars_left, left)) }
                    },
                    maxLines = 5,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.size(8.dp))
                FilledIconButton(
                    onClick = onSend,
                    enabled = enabled && value.isNotBlank(),
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                ) {
                    if (sending) {
                        androidx.compose.material3.CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(Res.string.practice_send))
                    }
                }
            }
        }
    }
}

/** Show the remaining characters once fewer than this are left. */
private const val CHARS_LEFT_FROM = 200
