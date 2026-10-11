package io.novawerk.psygym.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// Small pieces from the design (docs/product/design-diff-2026-10-11.md).

/**
 * A pill-shaped two-way switch: the chosen option is a page-coloured pill in bold on a grey
 * track. Used for 中 | EN in the intro and 报告 | 对话 in the session review.
 */
@Composable
fun <T> PillToggle(
    options: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    track: Color = MaterialTheme.colorScheme.surfaceVariant,
    fill: Boolean = false,
) {
    // The row is 48dp tall so every option has a full tap area; the grey track is drawn
    // 5dp in from top and bottom, so it looks the size of the design (38dp).
    Row(
        modifier
            .heightIn(min = 48.dp)
            .drawBehind {
                val inset = 5.dp.toPx()
                val h = size.height - 2 * inset
                drawRoundRect(track, topLeft = Offset(0f, inset), size = Size(size.width, h), cornerRadius = CornerRadius(h / 2))
            }
            .padding(horizontal = 3.dp)
            .selectableGroup(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        options.forEach { (value, label) ->
            PillOption(label, value == selected, { onSelect(value) }, fill)
        }
    }
}

@Composable
private fun RowScope.PillOption(label: String, chosen: Boolean, onClick: () -> Unit, fill: Boolean) {
    // The pill looks small, but the tap area is the full 48dp height (accessibility).
    Box(
        (if (fill) Modifier.weight(1f) else Modifier)
            .heightIn(min = 48.dp)
            .selectable(selected = chosen, onClick = onClick, role = Role.Tab),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .then(if (fill) Modifier.fillMaxWidth() else Modifier)
                .background(if (chosen) MaterialTheme.colorScheme.background else Color.Transparent, CircleShape)
                .padding(horizontal = 12.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = if (chosen) FontWeight.SemiBold else FontWeight.Normal,
                // tertiary is zinc-600 / zinc-300: 4.5:1 or more on the track in both themes.
                color = if (chosen) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.tertiary,
            )
        }
    }
}

/** The app mark: a dark rounded tile with a ring and two dots (H1). Inverts in dark mode. */
@Composable
fun LogoMark(size: Dp = 28.dp) {
    val tile = MaterialTheme.colorScheme.primary
    val ink = MaterialTheme.colorScheme.onPrimary
    Box(Modifier.size(size).background(tile, RoundedCornerShape(size * 8 / 28)), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val u = this.size.width / 28f
            drawCircle(ink, radius = 7f * u, center = Offset(14f * u, 14f * u), style = Stroke(width = 2f * u))
            drawCircle(ink, radius = 1.6f * u, center = Offset(11.5f * u, 14f * u))
            drawCircle(ink, radius = 1.6f * u, center = Offset(16.5f * u, 14f * u))
        }
    }
}

/** Shield with an exclamation mark: the app's one safety symbol ("Need help"), per the design. */
val ShieldAlert: ImageVector by lazy {
    ImageVector.Builder("ShieldAlert", 24.dp, 24.dp, 24f, 24f).apply {
        val stroke = SolidColor(Color.Black)
        path(stroke = stroke, strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
            moveTo(12f, 3f); lineTo(19f, 6f); verticalLineTo(11f)
            curveTo(19f, 15.5f, 16f, 19.5f, 12f, 21f)
            curveTo(8f, 19.5f, 5f, 15.5f, 5f, 11f)
            verticalLineTo(6f); close()
        }
        path(stroke = stroke, strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round) {
            moveTo(12f, 8f); verticalLineTo(12f)
            moveTo(12f, 15.5f); verticalLineTo(16f)
        }
    }.build()
}

/** A light grey card with no border (zinc-100, radius 12): O2's points, O3's groups, P3's answers. */
@Composable
fun GrayCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        content = content,
    )
}

/** A quiet underlined text link, centred in a row of links (O2). */
@Composable
fun UnderlinedLink(text: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, contentPadding = PaddingValues(horizontal = 8.dp)) {
        Text(
            text,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textDecoration = TextDecoration.Underline,
        )
    }
}
