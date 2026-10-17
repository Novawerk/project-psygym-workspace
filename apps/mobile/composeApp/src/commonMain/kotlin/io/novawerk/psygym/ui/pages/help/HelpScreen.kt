package io.novawerk.psygym.ui.pages.help

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.novawerk.psygym.domain.help.CrisisLine
import io.novawerk.psygym.domain.help.CrisisLines
import io.novawerk.psygym.domain.help.CrisisRegion
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.close
import io.novawerk.psygym.resources.help_body
import io.novawerk.psygym.resources.help_call_cd
import io.novawerk.psygym.resources.help_checked
import io.novawerk.psygym.resources.help_elsewhere
import io.novawerk.psygym.resources.help_hard_time
import io.novawerk.psygym.resources.help_lines_title
import io.novawerk.psygym.resources.help_other_regions
import io.novawerk.psygym.resources.help_practice_note
import io.novawerk.psygym.resources.help_title
import io.novawerk.psygym.ui.components.BottomActions
import io.novawerk.psygym.ui.components.GrayCard
import io.novawerk.psygym.ui.locale.rememberApiLocale
import io.novawerk.psygym.ui.locale.systemRegion
import org.jetbrains.compose.resources.stringResource

/**
 * X1 · Need help? Opens any time, works offline. Crisis lines by region (docs/safety.md §5):
 * the phone's own region first and open, the others folded below. Every number dials.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HelpScreen(onClose: () -> Unit) {
    val locale = rememberApiLocale()
    val (own, others) = remember { CrisisLines.ordered(systemRegion()) }
    // Folded regions the user opened. The own region is always open.
    var opened by rememberSaveable { mutableStateOf(setOf<String>()) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.Filled.Close, contentDescription = stringResource(Res.string.close))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        // The practice note sits at the bottom in a grey card (design X1).
        bottomBar = {
            BottomActions {
                GrayCard {
                    Text(
                        stringResource(Res.string.help_practice_note),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(stringResource(Res.string.help_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            // Plain text, one size up from the body (design X1).
            Text(stringResource(Res.string.help_body), style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp, lineHeight = 27.sp))
            Text(stringResource(Res.string.help_hard_time), style = MaterialTheme.typography.bodyLarge)

            Text(stringResource(Res.string.help_lines_title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (own != null) {
                RegionCard(own, locale)
            } else {
                // Not one of the regions we list: the general rule first, then every region.
                Text(stringResource(Res.string.help_elsewhere), style = MaterialTheme.typography.bodyLarge)
            }

            if (own != null) {
                Text(stringResource(Res.string.help_other_regions), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column {
                others.forEachIndexed { i, region ->
                    if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    val open = region.id in opened
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable(role = Role.Button) { opened = if (open) opened - region.id else opened + region.id }
                            .padding(vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(region.name.get(locale), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        Icon(
                            if (open) Icons.Filled.KeyboardArrowDown else Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (open) {
                        RegionCard(region, locale, showName = false)
                        Spacer(Modifier.size(12.dp))
                    }
                }
            }
            if (own != null) Text(stringResource(Res.string.help_elsewhere), style = MaterialTheme.typography.bodyMedium)
            Text(stringResource(Res.string.help_checked), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** A region's crisis lines, each with a call button, and its emergency numbers. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RegionCard(region: CrisisRegion, locale: ApiLocale, showName: Boolean = true) {
    GrayCard {
        if (showName) Text(region.name.get(locale), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = if (showName) 8.dp else 0.dp)) {
            region.lines.forEach { LineRow(it, locale) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                region.emergency.forEach { e -> CallButton("${e.label.get(locale)} ${e.number}", e.number) }
            }
        }
    }
}

@Composable
private fun LineRow(line: CrisisLine, locale: ApiLocale) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(line.name.get(locale), style = MaterialTheme.typography.bodyLarge)
            line.note?.let { Text(it.get(locale), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        Spacer(Modifier.width(12.dp))
        CallButton(line.display, line.dial)
    }
}

/** Opens the phone's dialer with [dial] filled in; nothing is called without the user. */
@Composable
private fun CallButton(text: String, dial: String) {
    val uri = LocalUriHandler.current
    val cd = stringResource(Res.string.help_call_cd, text)
    OutlinedButton(
        onClick = { runCatching { uri.openUri("tel:$dial") } },
        shape = MaterialTheme.shapes.small,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 6.dp),
        modifier = Modifier.semantics { contentDescription = cd },
    ) {
        Icon(Icons.Outlined.Phone, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface)
        Spacer(Modifier.width(6.dp))
        Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
    }
}
