package io.novawerk.psygym.ui.theme

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// shadcn/ui's neutral look (Tailwind zinc) mapped onto Material 3. Only this file names
// colours; screens read MaterialTheme.colorScheme.

private val White = Color(0xFFFFFFFF)
private val Zinc50 = Color(0xFFFAFAFA)
private val Zinc100 = Color(0xFFF4F4F5)
private val Zinc200 = Color(0xFFE4E4E7)
private val Zinc300 = Color(0xFFD4D4D8)
private val Zinc400 = Color(0xFFA1A1AA)
private val Zinc500 = Color(0xFF71717A)
private val Zinc600 = Color(0xFF52525B)
private val Zinc700 = Color(0xFF3F3F46)
private val Zinc800 = Color(0xFF27272A)
private val Zinc900 = Color(0xFF18181B)
private val Zinc950 = Color(0xFF09090B)

private val LightColors = lightColorScheme(
    primary = Zinc900,
    onPrimary = Zinc50,
    primaryContainer = Zinc100,
    onPrimaryContainer = Zinc900,
    secondary = Zinc100,
    onSecondary = Zinc900,
    secondaryContainer = Zinc100,
    onSecondaryContainer = Zinc900,
    tertiary = Zinc600,
    onTertiary = Zinc50,
    background = White,
    onBackground = Zinc950,
    surface = White,
    onSurface = Zinc950,
    surfaceVariant = Zinc100,
    // zinc-600, not 500: small secondary text on zinc-100 needs 4.5:1.
    onSurfaceVariant = Zinc600,
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = White,
    surfaceContainerLow = White,
    surfaceContainer = White,
    surfaceContainerHigh = Zinc100,
    surfaceContainerHighest = Zinc200,
    inverseSurface = Zinc900,
    inverseOnSurface = Zinc50,
    outline = Zinc200,
    outlineVariant = Zinc200,
    error = Color(0xFFDC2626),
    onError = White,
    errorContainer = Color(0xFFFEF2F2),
    onErrorContainer = Color(0xFF991B1B),
    scrim = Color(0x99000000),
)

private val DarkColors = darkColorScheme(
    primary = Zinc50,
    onPrimary = Zinc900,
    primaryContainer = Zinc800,
    onPrimaryContainer = Zinc50,
    secondary = Zinc800,
    onSecondary = Zinc50,
    secondaryContainer = Zinc800,
    onSecondaryContainer = Zinc50,
    tertiary = Zinc300,
    onTertiary = Zinc900,
    background = Zinc950,
    onBackground = Zinc50,
    surface = Zinc950,
    onSurface = Zinc50,
    // Muted blocks (cards, notes, client bubbles) are zinc-900 on zinc-950 (screens.md).
    surfaceVariant = Zinc900,
    onSurfaceVariant = Zinc400,
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Zinc950,
    surfaceContainerLow = Zinc900,
    surfaceContainer = Zinc900,
    surfaceContainerHigh = Zinc800,
    surfaceContainerHighest = Zinc700,
    inverseSurface = Zinc50,
    inverseOnSurface = Zinc900,
    outline = Zinc800,
    outlineVariant = Zinc800,
    error = Color(0xFFEF4444),
    onError = Zinc50,
    errorContainer = Color(0xFF450A0A),
    onErrorContainer = Color(0xFFFECACA),
    scrim = Color(0x99000000),
)

private val PsygymShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp),
)

@Composable
fun PsygymTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    // The system bars set at launch don't follow a theme switch while the app is open (audit H).
    SystemBarsAppearance(dark)
    MaterialTheme(colorScheme = if (dark) DarkColors else LightColors, shapes = PsygymShapes, content = content)
}

/** The 1px card border of the shadcn look. */
val cardBorder: BorderStroke
    @Composable @ReadOnlyComposable
    get() = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)

/** Status and navigation bar icons follow the app's theme, also when it changes while open. */
@Composable
expect fun SystemBarsAppearance(dark: Boolean)
