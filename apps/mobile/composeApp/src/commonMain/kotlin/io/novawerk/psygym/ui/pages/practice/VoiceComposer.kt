package io.novawerk.psygym.ui.pages.practice

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.voice.HoldToTalk
import io.novawerk.psygym.domain.voice.VoiceInput
import io.novawerk.psygym.domain.voice.VoiceLang
import io.novawerk.psygym.domain.voice.VoiceReadiness
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.voice_cancel
import io.novawerk.psygym.resources.voice_cancel_hint
import io.novawerk.psygym.resources.voice_failed
import io.novawerk.psygym.resources.voice_hold
import io.novawerk.psygym.resources.voice_hold_a11y
import io.novawerk.psygym.resources.voice_listening
import io.novawerk.psygym.resources.voice_mic_denied
import io.novawerk.psygym.resources.voice_mic_title
import io.novawerk.psygym.resources.voice_model_body
import io.novawerk.psygym.resources.voice_model_body_system
import io.novawerk.psygym.resources.voice_model_cellular
import io.novawerk.psygym.resources.voice_model_download
import io.novawerk.psygym.resources.voice_model_failed
import io.novawerk.psygym.resources.voice_model_progress
import io.novawerk.psygym.resources.voice_model_progress_unknown
import io.novawerk.psygym.resources.voice_model_title
import io.novawerk.psygym.resources.voice_nothing_heard
import io.novawerk.psygym.resources.voice_ok
import io.novawerk.psygym.resources.voice_open_settings
import io.novawerk.psygym.resources.voice_preparing
import io.novawerk.psygym.resources.voice_release_cancel
import io.novawerk.psygym.resources.voice_release_send
import io.novawerk.psygym.resources.voice_switch_to_keyboard
import io.novawerk.psygym.resources.voice_switch_to_voice
import io.novawerk.psygym.resources.voice_time_left
import io.novawerk.psygym.resources.voice_unsupported
import io.novawerk.psygym.resources.voice_unsupported_title
import io.novawerk.psygym.ui.components.GrayCard
import io.novawerk.psygym.ui.components.PrimaryButton
import io.novawerk.psygym.ui.components.SecondaryButton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

// Hold to talk on S1 (docs/product/voice-input.md §4). The text goes into the input box; the
// user edits and sends it. Nothing is sent by voice alone.

enum class VoiceSheet { Download, MicDenied, Unsupported }

/** The page's hold-to-talk state. [voiceMode] is the user's choice; the app remembers it. */
@Stable
class VoiceUi(
    val voice: VoiceInput,
    val hold: HoldToTalk,
    val lang: VoiceLang,
    private val scope: CoroutineScope,
    private val persistMode: (Boolean) -> Unit,
) {
    var voiceMode by mutableStateOf(false)
    var sheet by mutableStateOf<VoiceSheet?>(null)
    var toast by mutableStateOf<StringResource?>(null)

    /** The mic / keyboard button. */
    fun toggle() {
        if (voiceMode) {
            setMode(false)
            return
        }
        scope.launch {
            if (voice.readiness.value == VoiceReadiness.Unknown) voice.refresh(lang)
            when (voice.readiness.value) {
                is VoiceReadiness.NeedsDownload -> sheet = VoiceSheet.Download
                VoiceReadiness.Unsupported -> sheet = VoiceSheet.Unsupported
                VoiceReadiness.Unknown -> Unit
                else -> {
                    setMode(true)
                    voice.warmUp(lang)
                }
            }
        }
    }

    fun startDownload() {
        sheet = null
        voice.download(lang)
        setMode(true)
    }

    private fun setMode(on: Boolean) {
        voiceMode = on
        persistMode(on)
    }

    /** After a press: back to the keyboard so the words can be edited (not remembered as a choice). */
    fun showKeyboard() {
        voiceMode = false
    }
}

@Composable
fun rememberVoiceUi(voice: VoiceInput, lang: VoiceLang, savedMode: Boolean, persistMode: (Boolean) -> Unit, onHeard: (String) -> Unit): VoiceUi {
    val scope = rememberCoroutineScope()
    val ui = remember(voice, lang) {
        VoiceUi(voice, HoldToTalk(voice, scope), lang, scope, persistMode)
    }
    // The remembered choice, once: only when hold-to-talk can run.
    LaunchedEffect(ui) {
        voice.refresh(lang)
        val r = voice.readiness.value
        if (savedMode && (r == VoiceReadiness.Ready || r is VoiceReadiness.Downloading || r == VoiceReadiness.DownloadFailed)) {
            ui.voiceMode = true
            voice.warmUp(lang)
        }
    }
    // A download finished while in voice mode: load the model before the first press.
    LaunchedEffect(ui) {
        voice.readiness.collect { if (it == VoiceReadiness.Ready && ui.voiceMode) voice.warmUp(lang) }
    }
    LaunchedEffect(ui) {
        ui.hold.events.collect { e ->
            when (e) {
                is HoldToTalk.Event.Heard -> {
                    onHeard(e.text)
                    ui.showKeyboard()
                }
                HoldToTalk.Event.NothingHeard -> ui.toast = Res.string.voice_nothing_heard
                HoldToTalk.Event.Failed -> ui.toast = Res.string.voice_failed
                HoldToTalk.Event.MicDenied -> ui.sheet = VoiceSheet.MicDenied
            }
        }
    }
    LaunchedEffect(ui.toast) {
        if (ui.toast != null) {
            delay(2_500)
            ui.toast = null
        }
    }
    // Leaving the page: stop listening and free the model's memory.
    DisposableEffect(ui) {
        onDispose {
            ui.hold.abandon()
            voice.release()
        }
    }
    return ui
}

/** Left of the input: the mic, or the keyboard in voice mode. */
@Composable
fun VoiceToggle(ui: VoiceUi, enabled: Boolean) {
    IconButton(onClick = ui::toggle, enabled = enabled || ui.voiceMode) {
        Icon(
            if (ui.voiceMode) Icons.Outlined.Keyboard else Icons.Outlined.Mic,
            contentDescription = stringResource(if (ui.voiceMode) Res.string.voice_switch_to_keyboard else Res.string.voice_switch_to_voice),
        )
    }
}

/** Takes the input's place in voice mode: "hold to talk", or the model download's progress. */
@Composable
fun HoldButton(ui: VoiceUi, enabled: Boolean, modifier: Modifier = Modifier) {
    val readiness by ui.voice.readiness.collectAsState()
    val phase by ui.hold.phase.collectAsState()
    val shape = RoundedCornerShape(22.dp)
    val base = modifier.fillMaxWidth().heightIn(min = 44.dp)
    when (val r = readiness) {
        is VoiceReadiness.Downloading -> Column(
            base.background(MaterialTheme.colorScheme.surfaceVariant, shape).padding(horizontal = 24.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                r.progress?.let { stringResource(Res.string.voice_model_progress, (it * 100).toInt()) }
                    ?: stringResource(Res.string.voice_model_progress_unknown),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(6.dp))
            val p = r.progress
            if (p != null) {
                LinearProgressIndicator(progress = { p }, modifier = Modifier.fillMaxWidth(0.6f), color = MaterialTheme.colorScheme.primary, trackColor = MaterialTheme.colorScheme.outline, drawStopIndicator = {})
            } else {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth(0.6f), color = MaterialTheme.colorScheme.primary, trackColor = MaterialTheme.colorScheme.outline)
            }
        }
        VoiceReadiness.DownloadFailed -> Box(
            base.background(MaterialTheme.colorScheme.surfaceVariant, shape).clickable { ui.voice.download(ui.lang) },
            contentAlignment = Alignment.Center,
        ) {
            Text(stringResource(Res.string.voice_model_failed), style = MaterialTheme.typography.labelLarge)
        }
        else -> {
            val active = phase != HoldToTalk.Phase.Idle
            val cancelling = (phase as? HoldToTalk.Phase.Listening)?.cancelling == true
            val cancelPx = with(LocalDensity.current) { 64.dp.toPx() }
            val a11y = stringResource(Res.string.voice_hold_a11y)
            Box(
                base
                    .background(if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant, shape)
                    .semantics(mergeDescendants = true) {
                        role = Role.Button
                        contentDescription = a11y
                        // Screen readers can't hold: tap to start, tap again to finish.
                        onClick {
                            if (!enabled) return@onClick false
                            if (ui.hold.phase.value == HoldToTalk.Phase.Idle) ui.hold.press(ui.lang) else ui.hold.release()
                            true
                        }
                    }
                    .pointerInput(enabled, ui) {
                        if (!enabled) return@pointerInput
                        awaitEachGesture {
                            val down = awaitFirstDown()
                            ui.hold.press(ui.lang)
                            var inside = false
                            while (true) {
                                val event = awaitPointerEvent()
                                val c = event.changes.firstOrNull { it.id == down.id } ?: break
                                val now = c.position.y - down.position.y < -cancelPx
                                if (now != inside) {
                                    inside = now
                                    ui.hold.cancelZone(now)
                                }
                                c.consume()
                                if (!c.pressed) break
                            }
                            ui.hold.release()
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(
                        when {
                            !active -> Res.string.voice_hold
                            cancelling -> Res.string.voice_release_cancel
                            else -> Res.string.voice_release_send
                        },
                    ),
                    style = if (active) MaterialTheme.typography.labelLarge else MaterialTheme.typography.titleSmall,
                    fontWeight = if (active) FontWeight.Medium else FontWeight.SemiBold,
                    color = when {
                        active -> MaterialTheme.colorScheme.onPrimary
                        enabled -> MaterialTheme.colorScheme.onSurface
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
    }
}

/** Above the input while holding: the wave, the time and the live text. */
@Composable
fun VoiceBubble(ui: VoiceUi, modifier: Modifier = Modifier) {
    val phase by ui.hold.phase.collectAsState()
    if (phase == HoldToTalk.Phase.Idle) return
    val listening = phase as? HoldToTalk.Phase.Listening
    val cancelling = listening?.cancelling == true
    val shape = RoundedCornerShape(16.dp)
    Surface(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).border(1.dp, MaterialTheme.colorScheme.outline, shape),
        shape = shape,
        color = if (cancelling) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.background,
        shadowElevation = 6.dp,
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (cancelling) {
                    Icon(Icons.Outlined.Close, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(Res.string.voice_cancel_hint), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.weight(1f))
                } else {
                    Wave(ui, Modifier.weight(1f).height(22.dp))
                    Spacer(Modifier.width(12.dp))
                }
                val s = listening?.seconds ?: 0
                Text(
                    if (s >= HoldToTalk.WARN_FROM_SECONDS) stringResource(Res.string.voice_time_left, HoldToTalk.MAX_SECONDS - s)
                    else "${s / 60}:${(s % 60).toString().padStart(2, '0')}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(8.dp))
            val stable = listening?.stable ?: (phase as? HoldToTalk.Phase.Finishing)?.text.orEmpty()
            val pending = listening?.pending.orEmpty()
            if (stable.isEmpty() && pending.isEmpty()) {
                Text(
                    stringResource(if (phase == HoldToTalk.Phase.Starting) Res.string.voice_preparing else Res.string.voice_listening),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                val muted = MaterialTheme.colorScheme.onSurfaceVariant
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = if (cancelling) muted else MaterialTheme.colorScheme.onSurface)) { append(stable) }
                        withStyle(SpanStyle(color = muted)) { append(pending) }
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 6,
                )
            }
        }
    }
}

/** Thin bars following the microphone level, newest on the right. */
@Composable
private fun Wave(ui: VoiceUi, modifier: Modifier) {
    val bars = remember { mutableStateListOf<Float>().apply { repeat(BARS) { add(0f) } } }
    LaunchedEffect(ui) {
        while (true) {
            bars.removeAt(0)
            bars.add(ui.voice.level.value)
            delay(80)
        }
    }
    val color = MaterialTheme.colorScheme.onSurface
    Canvas(modifier) {
        val w = 3.dp.toPx()
        val gap = 3.dp.toPx()
        bars.forEachIndexed { i, v ->
            val h = (4.dp.toPx() + v * (size.height - 4.dp.toPx())).coerceAtMost(size.height)
            drawRoundRect(color, Offset(i * (w + gap), (size.height - h) / 2), Size(w, h), CornerRadius(w / 2))
        }
    }
}

private const val BARS = 28

/** "Didn't catch that" and the like, briefly, above the input. */
@Composable
fun VoiceToast(ui: VoiceUi, modifier: Modifier = Modifier) {
    val t = ui.toast ?: return
    Box(modifier.fillMaxWidth().padding(bottom = 12.dp), contentAlignment = Alignment.Center) {
        Text(
            stringResource(t),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.inverseOnSurface,
            modifier = Modifier.background(MaterialTheme.colorScheme.inverseSurface, RoundedCornerShape(10.dp)).padding(horizontal = 16.dp, vertical = 10.dp),
        )
    }
}

/** Download the model, microphone denied, or not supported on this device. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceSheets(ui: VoiceUi) {
    val sheet = ui.sheet ?: return
    val dismiss = { ui.sheet = null }
    ModalBottomSheet(
        onDismissRequest = dismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.background,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            val body = MaterialTheme.typography.bodyMedium
            val muted = MaterialTheme.colorScheme.onSurfaceVariant
            when (sheet) {
                VoiceSheet.Download -> {
                    Text(stringResource(Res.string.voice_model_title), style = MaterialTheme.typography.titleLarge)
                    val bytes = (ui.voice.readiness.value as? VoiceReadiness.NeedsDownload)?.bytes
                    Text(
                        if (bytes != null) stringResource(Res.string.voice_model_body, (bytes / 1_000_000).toInt())
                        else stringResource(Res.string.voice_model_body_system),
                        style = body, color = muted,
                    )
                    if (remember { ui.voice.isMetered() }) {
                        GrayCard {
                            Row(verticalAlignment = Alignment.Top) {
                                Icon(Icons.Outlined.Wifi, contentDescription = null, modifier = Modifier.size(16.dp).padding(top = 2.dp), tint = muted)
                                Spacer(Modifier.width(8.dp))
                                Text(stringResource(Res.string.voice_model_cellular), style = body, color = muted)
                            }
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    PrimaryButton(stringResource(Res.string.voice_model_download), ui::startDownload)
                    SecondaryButton(stringResource(Res.string.voice_cancel), dismiss)
                }
                VoiceSheet.MicDenied -> {
                    Text(stringResource(Res.string.voice_mic_title), style = MaterialTheme.typography.titleLarge)
                    Text(stringResource(Res.string.voice_mic_denied), style = body, color = muted)
                    Spacer(Modifier.height(4.dp))
                    PrimaryButton(stringResource(Res.string.voice_open_settings), {
                        ui.sheet = null
                        ui.voice.openSettings()
                    })
                    SecondaryButton(stringResource(Res.string.voice_cancel), dismiss)
                }
                VoiceSheet.Unsupported -> {
                    Text(stringResource(Res.string.voice_unsupported_title), style = MaterialTheme.typography.titleLarge)
                    Text(stringResource(Res.string.voice_unsupported), style = body, color = muted)
                    Spacer(Modifier.height(4.dp))
                    PrimaryButton(stringResource(Res.string.voice_ok), dismiss)
                }
            }
        }
    }
}
