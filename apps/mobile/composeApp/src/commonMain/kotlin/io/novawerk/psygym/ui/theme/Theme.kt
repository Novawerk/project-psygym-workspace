package io.novawerk.psygym.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Novawerk greens and cream. Only this file names colours; UI reads MaterialTheme.

private val Green = Color(0xFF1F7A4A)
private val GreenDeep = Color(0xFF0F4D2C)
private val GreenSoft = Color(0xFFBFE8CF)
private val GreenLight = Color(0xFF8DD3A8)
private val Cream = Color(0xFFEFE9D8)
private val CreamHigh = Color(0xFFF8F4EA)
private val CreamLow = Color(0xFFE5DEC9)
private val Ink = Color(0xFF1D1C17)
private val InkSoft = Color(0xFF4A4739)
private val Clay = Color(0xFF8A5A2B)
private val ClaySoft = Color(0xFFF5DDC3)

private val Night = Color(0xFF121411)
private val NightHigh = Color(0xFF1E211C)
private val NightHigher = Color(0xFF282C26)
private val Mist = Color(0xFFE4E3DA)
private val MistSoft = Color(0xFFBFC2B7)

private val LightColors = lightColorScheme(
    primary = Green,
    onPrimary = Color.White,
    primaryContainer = GreenSoft,
    onPrimaryContainer = GreenDeep,
    secondary = Clay,
    onSecondary = Color.White,
    secondaryContainer = ClaySoft,
    onSecondaryContainer = Color(0xFF3B2410),
    background = Cream,
    onBackground = Ink,
    surface = Cream,
    onSurface = Ink,
    surfaceVariant = CreamLow,
    onSurfaceVariant = InkSoft,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = CreamHigh,
    surfaceContainer = CreamHigh,
    surfaceContainerHigh = CreamLow,
    surfaceContainerHighest = Color(0xFFDDD5BD),
    outline = Color(0xFF7B7766),
    outlineVariant = Color(0xFFCFC7B0),
)

private val DarkColors = darkColorScheme(
    primary = GreenLight,
    onPrimary = Color(0xFF00391C),
    primaryContainer = Color(0xFF14532F),
    onPrimaryContainer = GreenSoft,
    secondary = Color(0xFFE7BE92),
    onSecondary = Color(0xFF452B10),
    secondaryContainer = Color(0xFF5E4022),
    onSecondaryContainer = ClaySoft,
    background = Night,
    onBackground = Mist,
    surface = Night,
    onSurface = Mist,
    surfaceVariant = NightHigher,
    onSurfaceVariant = MistSoft,
    surfaceContainerLowest = Color(0xFF0C0E0B),
    surfaceContainerLow = NightHigh,
    surfaceContainer = NightHigh,
    surfaceContainerHigh = NightHigher,
    surfaceContainerHighest = Color(0xFF333731),
    outline = Color(0xFF8C9087),
    outlineVariant = Color(0xFF42463F),
)

@Composable
fun PsygymTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) DarkColors else LightColors, content = content)
}
