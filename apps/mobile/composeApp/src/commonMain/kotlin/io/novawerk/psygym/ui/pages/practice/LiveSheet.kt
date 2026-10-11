package io.novawerk.psygym.ui.pages.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.foundation.clickable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.practice.LiveNotes
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.live_back
import io.novawerk.psygym.resources.live_chip
import io.novawerk.psygym.resources.live_chip_cd
import io.novawerk.psygym.resources.live_chip_seen
import io.novawerk.psygym.resources.live_chip_used_up
import io.novawerk.psygym.resources.live_footer
import io.novawerk.psygym.resources.live_generating
import io.novawerk.psygym.resources.live_new_cd
import io.novawerk.psygym.resources.live_subtitle
import io.novawerk.psygym.resources.live_title
import io.novawerk.psygym.resources.live_used_up
import io.novawerk.psygym.resources.report_risk_cd
import io.novawerk.psygym.ui.components.ErrorCard
import io.novawerk.psygym.ui.components.PrimaryButton
import org.jetbrains.compose.resources.stringResource

// Mid-session supervisor notes (docs/product/live-supervision.md, design row ⑧): a quiet chip
// under the top bar, and a bottom sheet with the notes.

/** "Supervisor's take" / "Supervisor · turn 6" / "Supervisor · seen 5 times", a dot when there's something new. */
@Composable
fun LiveChip(notes: LiveNotes, turns: Int, enabled: Boolean, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val label = when {
        notes.usedUp -> stringResource(Res.string.live_chip_used_up, notes.made)
        notes.made > 0 -> stringResource(Res.string.live_chip_seen, notes.turn)
        else -> stringResource(Res.string.live_chip)
    }
    val hasNew = notes.hasNew(turns)
    // Read the visible label (turn, times seen) without the "·", then the dot; the action says
    // what tapping does.
    val read = label.replace(" · ", ", ") + if (hasNew) ", " + stringResource(Res.string.live_new_cd) else ""
    val action = stringResource(Res.string.live_chip_cd)
    Row(
        modifier
            .heightIn(min = 48.dp)
            // Greyed while the client is replying (live-supervision.md §1).
            .alpha(if (enabled) 1f else 0.5f)
            .clip(CircleShape)
            // The button role, the action label and "disabled" come from clickable; the text
            // inside is replaced by one readable line.
            .clickable(enabled = enabled, onClickLabel = action, role = Role.Button, onClick = onOpen)
            .clearAndSetSemantics { contentDescription = read },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.background(MaterialTheme.colorScheme.surfaceVariant, CircleShape).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Outlined.Visibility, contentDescription = null, modifier = Modifier.size(15.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (hasNew) Box(Modifier.size(6.dp).background(MaterialTheme.colorScheme.onSurface, CircleShape))
        }
    }
}

/** The notes. Opens half-height (the conversation stays visible above), can be pulled up. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveSheet(notes: LiveNotes, onRetry: () -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.background,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 24.dp)) {
            Text(stringResource(Res.string.live_title), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                stringResource(Res.string.live_subtitle, notes.shownTurn),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp, bottom = 12.dp),
            )
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when {
                    // Only this one line while waiting: no other status labels (decided 2026-10-11).
                    notes.writing && notes.shownText.isEmpty() -> Row(
                        Modifier
                            .fillMaxWidth()
                            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                        Text(stringResource(Res.string.live_generating), style = MaterialTheme.typography.bodyMedium)
                    }
                    notes.shownText.isNotEmpty() -> liveItems(notes.shownText).forEach { NoteItem(it) }
                }
                notes.error?.let { ErrorCard(it, onRetry = onRetry) }
                if (notes.usedUp) {
                    Text(
                        stringResource(Res.string.live_used_up),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(10.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    )
                }
            }
            Text(
                stringResource(Res.string.live_footer),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 12.dp, bottom = 10.dp),
            )
            PrimaryButton(stringResource(Res.string.live_back), onDismiss)
        }
    }
}

/** One note. The risk reminder gets the shield (read as "Risk screening"), no text label, like the report. */
@Composable
private fun NoteItem(item: LiveItem) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (item.risk) {
            Icon(
                Icons.Outlined.Shield,
                contentDescription = stringResource(Res.string.report_risk_cd),
                modifier = Modifier.padding(top = 3.dp).size(15.dp),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        } else {
            Text("·", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(item.text, style = MaterialTheme.typography.bodyMedium)
    }
}

data class LiveItem(val text: String, val risk: Boolean)

/**
 * The live format is 1–3 "- " items, no headings (live-supervision.md §3). Lines that aren't
 * items continue the item above, or stand alone; nothing is dropped or rewritten (quotes are
 * word for word).
 */
fun liveItems(text: String): List<LiveItem> {
    val items = mutableListOf<String>()
    text.lines().forEach { line ->
        val t = line.trim()
        when {
            t.isEmpty() -> Unit
            t.startsWith("- ") || t.startsWith("* ") -> items += t.drop(2).trim()
            items.isEmpty() -> items += t
            else -> items[items.lastIndex] = items[items.lastIndex] + " " + t
        }
    }
    // The risk reminder comes first when there is one; as on the report, it's the first item
    // quoting only the client (product, 2026-10-11). A later item quoting the client isn't one.
    // Quote markers, as ReportParser reads them: 「你说」 inside a suggested line isn't a quote.
    return items.mapIndexed { i, raw ->
        val clientQuote = CLIENT_QUOTE.containsMatchIn(raw)
        val ownQuote = OWN_QUOTE.containsMatchIn(raw)
        LiveItem(raw, risk = i == 0 && clientQuote && !ownQuote)
    }
}

private val CLIENT_QUOTE = Regex("""来访者说[：:]?\s*「|the client said[：:,]?\s*[“"]""", RegexOption.IGNORE_CASE)
private val OWN_QUOTE = Regex("""你说[：:]?\s*「|you said[：:,]?\s*[“"]""", RegexOption.IGNORE_CASE)
