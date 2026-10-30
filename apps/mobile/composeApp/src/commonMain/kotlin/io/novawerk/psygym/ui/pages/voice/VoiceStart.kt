package io.novawerk.psygym.ui.pages.voice

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import io.novawerk.psygym.domain.voice.MicPermission
import io.novawerk.psygym.domain.voice.VoiceCall
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.voice_mic_needed
import io.novawerk.psygym.resources.voice_mic_needed_title
import io.novawerk.psygym.resources.voice_open_settings
import io.novawerk.psygym.resources.voice_use_text
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource

/**
 * Asks for the microphone, then [onGranted]. Refused: a dialog with the way to Settings and the
 * way to typing, so the same case can still be practised (V4). Returns what to call.
 */
@Composable
fun rememberMicGate(call: VoiceCall, onGranted: () -> Unit, onTypeInstead: () -> Unit): () -> Unit {
    val scope = rememberCoroutineScope()
    var denied by remember { mutableStateOf(false) }
    if (denied) {
        AlertDialog(
            onDismissRequest = { denied = false },
            title = { Text(stringResource(Res.string.voice_mic_needed_title)) },
            text = { Text(stringResource(Res.string.voice_mic_needed)) },
            confirmButton = {
                TextButton(onClick = {
                    denied = false
                    call.openSettings()
                }) { Text(stringResource(Res.string.voice_open_settings)) }
            },
            dismissButton = {
                TextButton(onClick = {
                    denied = false
                    onTypeInstead()
                }) { Text(stringResource(Res.string.voice_use_text)) }
            },
        )
    }
    return {
        scope.launch {
            if (call.micPermission() == MicPermission.Granted || call.requestMic()) onGranted() else denied = true
        }
    }
}
