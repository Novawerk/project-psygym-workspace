package io.novawerk.psygym.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.m3.markdownTypography
import io.novawerk.psygym.domain.report.ParsedReport
import io.novawerk.psygym.domain.report.Quote
import io.novawerk.psygym.domain.report.ReportItem
import io.novawerk.psygym.domain.report.ReportParser
import io.novawerk.psygym.domain.report.ReportSection
import io.novawerk.psygym.domain.report.Speaker
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.report_client_said
import io.novawerk.psygym.resources.report_risk_cd
import io.novawerk.psygym.resources.report_try_instead
import io.novawerk.psygym.resources.report_you_said
import org.jetbrains.compose.resources.stringResource

/**
 * A supervision report (R1, M2). In the backend's format it shows as cards (design R1,
 * screens.md R1 items 4–7); anything else shows as plain Markdown, as before. Long press
 * selects and copies.
 */
@Composable
fun ReportView(report: String, modifier: Modifier = Modifier) {
    val parsed = remember(report) { ReportParser.parse(report) }
    SelectionContainer(modifier) {
        if (parsed == null) ReportMarkdown(report) else ReportCards(parsed)
    }
}

@Composable
private fun ReportMarkdown(text: String, modifier: Modifier = Modifier.fillMaxWidth()) {
    val type = MaterialTheme.typography
    Markdown(
        content = text,
        typography = markdownTypography(
            h1 = type.headlineSmall, h2 = type.titleLarge, h3 = type.titleMedium, h4 = type.titleSmall,
            text = type.bodyLarge, paragraph = type.bodyLarge, bullet = type.bodyLarge, list = type.bodyLarge, ordered = type.bodyLarge,
        ),
        modifier = modifier,
    )
}

@Composable
private fun ReportCards(report: ParsedReport) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(22.dp)) {
        if (report.intro.isNotEmpty()) ReportMarkdown(report.intro)
        report.parts.forEach { part ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionTitle(part.section, part.title)
                if (part.section == ReportSection.Next) {
                    NextCard(part.items)
                } else {
                    part.items.forEach { ItemCard(it, part.section) }
                }
            }
        }
        if (report.footer.isNotEmpty()) {
            Text(report.footer, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** A heading with its round icon: tick, arrow, target. */
@Composable
private fun SectionTitle(section: ReportSection, title: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        val colors = MaterialTheme.colorScheme
        val circle = if (section == ReportSection.Good) colors.surfaceVariant else colors.surfaceContainerHighest
        Box(Modifier.size(28.dp).background(circle, CircleShape), contentAlignment = Alignment.Center) {
            when (section) {
                ReportSection.Good -> Icon(Icons.Filled.Check, null, Modifier.size(16.dp), tint = colors.onSurface)
                ReportSection.Improve -> Icon(Icons.AutoMirrored.Filled.ArrowForward, null, Modifier.size(16.dp), tint = colors.onSurfaceVariant)
                ReportSection.Next -> Target(colors.onSurfaceVariant)
            }
        }
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun Target(color: Color) {
    Canvas(Modifier.size(16.dp)) {
        val stroke = Stroke(width = 2.2.dp.toPx())
        drawCircle(color, radius = size.minDimension / 3f, style = stroke)
        drawCircle(color, radius = size.minDimension / 7f, style = stroke)
    }
}

@Composable
private fun ItemCard(item: ReportItem, section: ReportSection) {
    GrayCard {
        when (item) {
            is ReportItem.Plain -> ReportMarkdown(item.raw)
            is ReportItem.Parsed -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // "Went well" leads with the quote; "to improve" leads with the problem.
                val noteFirst = section == ReportSection.Improve
                if (noteFirst && item.note.isNotEmpty()) Note(item.note, item.risk, strong = true)
                item.quotes.forEach { QuoteBlock(it) }
                if (!noteFirst && item.note.isNotEmpty()) Note(item.note, item.risk, strong = false)
                item.tryInstead?.let { TryInstead(it) }
            }
        }
    }
}

@Composable
private fun Note(text: String, risk: Boolean, strong: Boolean) {
    val color = if (strong) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (risk) {
            Icon(
                Icons.Outlined.Shield,
                contentDescription = stringResource(Res.string.report_risk_cd),
                modifier = Modifier.padding(top = 3.dp).size(16.dp),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
        Text(text, style = MaterialTheme.typography.bodyMedium, color = color)
    }
}

/** The words as said, on the page colour, with who said them above. */
@Composable
private fun QuoteBlock(quote: Quote) {
    Column(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            stringResource(if (quote.speaker == Speaker.Counselor) Res.string.report_you_said else Res.string.report_client_said),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(quote.text, style = MaterialTheme.typography.bodyLarge)
    }
}

/** The suggested line: no quote marks, it isn't a quote. */
@Composable
private fun TryInstead(text: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(stringResource(Res.string.report_try_instead), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

/** "What to practise next": one card, numbered. */
@Composable
private fun NextCard(items: List<ReportItem>) {
    if (items.isEmpty()) return
    GrayCard {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items.forEachIndexed { i, item ->
                when (item) {
                    is ReportItem.Parsed -> Text("${i + 1}　${item.note}", style = MaterialTheme.typography.bodyLarge)
                    is ReportItem.Plain -> ReportMarkdown(item.raw)
                }
            }
        }
    }
}
