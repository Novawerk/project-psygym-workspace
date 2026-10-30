package io.novawerk.psygym.ui.components

import androidx.compose.runtime.Composable

/** The screen stays on while this is in the composition: a voice session has no taps. */
@Composable
expect fun KeepScreenOn()
