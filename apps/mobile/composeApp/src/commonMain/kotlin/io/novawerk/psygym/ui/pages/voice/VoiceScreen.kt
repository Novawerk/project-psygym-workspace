package io.novawerk.psygym.ui.pages.voice

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconToggleButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import io.novawerk.psygym.domain.voice.VoiceCallEnd
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.practice_client_ended
import io.novawerk.psygym.resources.practice_end_confirm
import io.novawerk.psygym.resources.practice_help_cd
import io.novawerk.psygym.resources.practice_limit_reached
import io.novawerk.psygym.resources.practice_meta
import io.novawerk.psygym.resources.practice_near_limit
import io.novawerk.psygym.resources.retry
import io.novawerk.psygym.resources.voice_can_interrupt
import io.novawerk.psygym.resources.voice_client_speaking
import io.novawerk.psygym.resources.voice_connect_failed
import io.novawerk.psygym.resources.voice_connected
import io.novawerk.psygym.resources.voice_connecting
import io.novawerk.psygym.resources.voice_continue_text
import io.novawerk.psygym.resources.voice_dropped
import io.novawerk.psygym.resources.voice_end
import io.novawerk.psygym.resources.voice_left
import io.novawerk.psygym.resources.voice_listening_you
import io.novawerk.psygym.resources.voice_live_note
import io.novawerk.psygym.resources.voice_mic_off
import io.novawerk.psygym.resources.voice_mic_off_cd
import io.novawerk.psygym.resources.voice_mic_off_hint
import io.novawerk.psygym.resources.voice_mic_on
import io.novawerk.psygym.resources.voice_mic_on_cd
import io.novawerk.psygym.resources.voice_practice_line
import io.novawerk.psygym.resources.voice_use_text
import io.novawerk.psygym.ui.components.CaseAvatar
import io.novawerk.psygym.ui.components.ErrorCard
import io.novawerk.psygym.ui.components.GrayCard
import io.novawerk.psygym.ui.components.KeepScreenOn
import io.novawerk.psygym.ui.components.PrimaryButton
import io.novawerk.psygym.ui.components.SecondaryButton
import io.novawerk.psygym.ui.components.ShieldAlert
import io.novawerk.psygym.ui.locale.rememberApiLocale
import io.novawerk.psygym.ui.pages.practice.EndSheet
import io.novawerk.psygym.ui.pages.practice.LiveChip
import io.novawerk.psygym.ui.pages.practice.LiveSheet
import io.novawerk.psygym.ui.pages.practice.SystemLine
import io.novawerk.psygym.ui.pages.practice.clockText
import kotlinx.coroutines.delay
import org.jetbrains.compose.resources.stringResource
import kotlin.time.Duration

/** V2–V5 · A voice session (docs/product/voice-session-design.md). */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class)
@Composable
fun VoiceScreen(
    viewModel: VoiceViewModel,
    elapsed: () -> Duration,
    saveHistory: Boolean,
    liveEnabled: Boolean,
    caseIndex: Int,
    onLeave: () -> Unit,
    onSessionLost: () -> Unit,
    onEnd: () -> Unit,
    /** To a typed session: the transcript carries over. */
    onContinueTyping: () -> Unit,
    onHelp: () -> Unit,
    onOtherCase: () -> Unit,
) {
    val locale = rememberApiLocale()
    var showEndSheet by rememberSaveable { mutableStateOf(false) }
    var showLive by rememberSaveable { mutableStateOf(false) }
    val over = viewModel.phase == VoicePhase.Over
    val connecting = viewModel.phase == VoicePhase.Connecting

    LaunchedEffect(Unit) {
        if (viewModel.case == null) onSessionLost() else viewModel.start(locale)
    }
    KeepScreenOn()
    // Leaving the app, a phone call or "Need help?": hang up. A client talking over the help page
    // is wrong (principles §1), and a call nobody hears still costs minutes.
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { viewModel.leave() }
    LaunchedEffect(showEndSheet) { viewModel.holdMic(showEndSheet) }
    // While it's connecting nothing has started: back just goes back.
    BackHandler(enabled = !showEndSheet && !connecting) { showEndSheet = true }

    val clock by produceState("00:00") {
        while (true) {
            value = elapsed().clockText()
            delay(1_000)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            viewModel.case?.let { (it.clientAlias ?: it.title).get(locale) }.orEmpty(),
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            if (viewModel.turns == 0) clock else stringResource(Res.string.practice_meta, viewModel.turns, clock),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { if (connecting) onLeave() else showEndSheet = true }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                    }
                },
                actions = {
                    IconButton(onClick = onHelp) {
                        Icon(ShieldAlert, contentDescription = stringResource(Res.string.practice_help_cd))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.background) {
                Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 10.dp)) {
                    when {
                        !over -> {
                            Text(
                                stringResource(if (viewModel.nearLimit) Res.string.practice_near_limit else Res.string.voice_practice_line),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                            )
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                            CallControls(viewModel.muted, !connecting, viewModel::toggleMute) { showEndSheet = true }
                        }
                        viewModel.clientEnded || viewModel.atLimit ->
                            PrimaryButton(stringResource(Res.string.practice_end_confirm), onEnd)
                        viewModel.canReport -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            GrayCard {
                                Text(stringResource(if (viewModel.left) Res.string.voice_left else Res.string.voice_dropped), style = MaterialTheme.typography.bodyMedium)
                            }
                            PrimaryButton(stringResource(Res.string.voice_continue_text), onContinueTyping)
                            SecondaryButton(stringResource(Res.string.practice_end_confirm), onEnd)
                        }
                        else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (viewModel.error == null) {
                                GrayCard { Text(stringResource(Res.string.voice_connect_failed), style = MaterialTheme.typography.bodyMedium) }
                                PrimaryButton(stringResource(Res.string.retry), { viewModel.retry(locale) })
                            }
                            SecondaryButton(stringResource(Res.string.voice_use_text), onContinueTyping)
                        }
                    }
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (viewModel.live.chipVisible(viewModel.turns, liveEnabled, viewModel.clientEnded)) {
                LiveChip(
                    notes = viewModel.live,
                    turns = viewModel.turns,
                    // Unlike S1, also while the client talks: in voice that's most of the time.
                    enabled = !over && !connecting,
                    onOpen = {
                        viewModel.openLive(locale)
                        showLive = true
                    },
                    modifier = Modifier.padding(start = 16.dp),
                )
            }
            // A call, not a chat: no running text. The transcript goes on to the report and to typing.
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                CallStatus(viewModel, caseIndex)
            }
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (viewModel.clientEnded) SystemLine(stringResource(Res.string.practice_client_ended))
                if (viewModel.atLimit) SystemLine(stringResource(Res.string.practice_limit_reached))
                viewModel.error?.let { error ->
                    ErrorCard(error = error, onRetry = { viewModel.retry(locale) }, onOtherCase = onOtherCase)
                }
            }
        }
    }

    if (showLive && viewModel.live.hasContent) {
        LiveSheet(
            notes = viewModel.live,
            note = stringResource(Res.string.voice_live_note).takeIf { !over },
            onRetry = { viewModel.retryLive(locale) },
            onDismiss = { showLive = false },
        )
    }

    if (showEndSheet) {
        EndSheet(
            kind = viewModel.endKind,
            saveHistory = saveHistory,
            onEnd = {
                showEndSheet = false
                viewModel.hangUp()
                onEnd()
            },
            onLeave = {
                showEndSheet = false
                viewModel.hangUp()
                onLeave()
            },
            onDismiss = { showEndSheet = false },
        )
    }
}

/** The client's avatar in rings that breathe, and one line that says who has the floor. */
@Composable
private fun CallStatus(viewModel: VoiceViewModel, caseIndex: Int) {
    val locale = rememberApiLocale()
    val phase = viewModel.phase
    val muted = viewModel.muted
    val (text, hint) = when {
        phase == VoicePhase.Connecting -> stringResource(Res.string.voice_connecting) to null
        phase == VoicePhase.Speaking -> stringResource(Res.string.voice_client_speaking) to stringResource(Res.string.voice_can_interrupt)
        phase == VoicePhase.Listening && muted -> stringResource(Res.string.voice_mic_off) to stringResource(Res.string.voice_mic_off_hint)
        phase == VoicePhase.Listening && viewModel.messages.isEmpty() -> stringResource(Res.string.voice_connected) to null
        phase == VoicePhase.Listening -> stringResource(Res.string.voice_listening_you) to null
        viewModel.ended == VoiceCallEnd.Dropped -> stringResource(Res.string.voice_connect_failed) to null
        else -> "" to null
    }
    val breath by rememberInfiniteTransition().animateFloat(0f, 1f, infiniteRepeatable(tween(1600), RepeatMode.Reverse))
    val speaking = phase == VoicePhase.Speaking
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .alpha(if (muted && phase == VoicePhase.Listening) 0.45f else 1f)
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(120.dp), contentAlignment = Alignment.Center) {
            if (speaking) Ring(116.dp, 0.84f + 0.16f * breath)
            Ring(96.dp, if (phase == VoicePhase.Over) 1f else 0.9f + 0.1f * breath)
            viewModel.case?.let { CaseAvatar(it, caseIndex, locale, size = 72.dp) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(text, style = MaterialTheme.typography.titleSmall)
            if (hint != null) Text("· $hint", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Ring(size: Dp, scale: Float) {
    Box(Modifier.size(size).scale(scale).border(BorderStroke(1.dp, MaterialTheme.colorScheme.onSurfaceVariant), CircleShape))
}

@Composable
private fun CallControls(muted: Boolean, enabled: Boolean, onToggleMute: () -> Unit, onEnd: () -> Unit) {
    Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            FilledIconToggleButton(
                checked = muted,
                onCheckedChange = { onToggleMute() },
                enabled = enabled,
                modifier = Modifier.size(56.dp),
                colors = IconButtonDefaults.filledIconToggleButtonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    checkedContainerColor = MaterialTheme.colorScheme.background,
                    checkedContentColor = MaterialTheme.colorScheme.onSurface,
                ),
            ) {
                Icon(
                    if (muted) Icons.Filled.MicOff else Icons.Filled.Mic,
                    contentDescription = stringResource(if (muted) Res.string.voice_mic_off_cd else Res.string.voice_mic_on_cd),
                )
            }
            Text(
                stringResource(if (muted) Res.string.voice_mic_off else Res.string.voice_mic_on),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // The main colour, not red: red is only for real errors (screens.md).
        Button(onClick = onEnd, enabled = enabled, modifier = Modifier.weight(1f).heightIn(min = 56.dp), shape = CircleShape) {
            Icon(Icons.Filled.CallEnd, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
            Text(stringResource(Res.string.voice_end), style = MaterialTheme.typography.titleSmall)
        }
    }
}
