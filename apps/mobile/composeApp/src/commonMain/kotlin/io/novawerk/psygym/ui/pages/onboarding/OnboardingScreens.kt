package io.novawerk.psygym.ui.pages.onboarding

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.settings.AppLanguage
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.help_link
import io.novawerk.psygym.resources.onb_consent_1_body
import io.novawerk.psygym.resources.onb_consent_1_title
import io.novawerk.psygym.resources.onb_consent_2_body
import io.novawerk.psygym.resources.onb_consent_2_title
import io.novawerk.psygym.resources.onb_consent_3_body
import io.novawerk.psygym.resources.onb_consent_3_title
import io.novawerk.psygym.resources.onb_consent_4_body
import io.novawerk.psygym.resources.onb_consent_4_title
import io.novawerk.psygym.resources.onb_consent_5_body
import io.novawerk.psygym.resources.onb_consent_5_title
import io.novawerk.psygym.resources.onb_consent_accept
import io.novawerk.psygym.resources.onb_consent_ai_check
import io.novawerk.psygym.resources.onb_consent_check
import io.novawerk.psygym.resources.onb_consent_title
import io.novawerk.psygym.resources.onb_continue
import io.novawerk.psygym.resources.onb_link_privacy
import io.novawerk.psygym.resources.onb_skip
import io.novawerk.psygym.resources.onb_step1_body
import io.novawerk.psygym.resources.onb_step1_title
import io.novawerk.psygym.resources.onb_step2_body
import io.novawerk.psygym.resources.onb_step2_title
import io.novawerk.psygym.resources.onb_step3_body
import io.novawerk.psygym.resources.onb_step3_title
import io.novawerk.psygym.resources.onb_welcome_subtitle
import io.novawerk.psygym.resources.onb_welcome_title
import io.novawerk.psygym.ui.components.BottomActions
import io.novawerk.psygym.ui.components.GrayCard
import io.novawerk.psygym.ui.components.UnderlinedLink
import io.novawerk.psygym.ui.components.LanguageToggle
import io.novawerk.psygym.ui.components.PrimaryButton
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

// docs/product/onboarding.md: two pages, page dots, 中/EN top right, one main button
// at the bottom. O1 can be skipped; O2 can't. No language page: the language follows the
// system until changed with the toggle or in P1. No system permissions.

/** Top row shared by O1–O2: page dots, Skip (when allowed), language toggle (when given). */
@Composable
private fun OnboardingTopBar(page: Int, onSkip: (() -> Unit)?, onLanguage: ((AppLanguage) -> Unit)?) {
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(start = 20.dp, end = 8.dp, top = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            // The current page is a short pill, the others dots (design O1–O2).
            repeat(PAGES) { i ->
                Box(
                    Modifier.size(width = if (i == page) 20.dp else 6.dp, height = 6.dp).background(
                        if (i == page) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                        CircleShape,
                    ),
                )
            }
        }
        Spacer(Modifier.weight(1f))
        if (onSkip != null) {
            TextButton(onClick = onSkip) {
                Text(stringResource(Res.string.onb_skip), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (onLanguage != null) LanguageToggle(onChange = onLanguage)
    }
}

private const val PAGES = 2

@Composable
private fun OnboardingPage(
    page: Int,
    onSkip: (() -> Unit)?,
    onLanguage: ((AppLanguage) -> Unit)?,
    bottom: @Composable ColumnScope.() -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Scaffold(
        topBar = { OnboardingTopBar(page, onSkip, onLanguage) },
        bottomBar = { BottomActions(content = bottom) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            content = content,
        )
    }
}

/** O1 · Welcome. */
@Composable
fun WelcomeScreen(onContinue: () -> Unit, onSkip: () -> Unit, onLanguage: (AppLanguage) -> Unit) {
    // Skip sits under Continue as a text button, not up top (design O1).
    OnboardingPage(
        page = 0,
        onSkip = null,
        onLanguage = onLanguage,
        bottom = {
            PrimaryButton(stringResource(Res.string.onb_continue), onContinue)
            TextButton(onClick = onSkip) {
                Text(stringResource(Res.string.onb_skip), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
    ) {
        Spacer(Modifier.height(16.dp))
        WelcomeArt()
        Spacer(Modifier.height(32.dp))
        Text(stringResource(Res.string.onb_welcome_title), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(Res.string.onb_welcome_subtitle),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(28.dp))
        Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Step(1, Res.string.onb_step1_title, Res.string.onb_step1_body)
            Step(2, Res.string.onb_step2_title, Res.string.onb_step2_body)
            Step(3, Res.string.onb_step3_title, Res.string.onb_step3_body)
        }
    }
}

/**
 * O1 illustration: a counseling room, two chairs facing each other. One is empty (you);
 * above the other floats a soft light (the AI client). Line art in the theme's greys.
 */
@Composable
private fun WelcomeArt() {
    val line = MaterialTheme.colorScheme.onSurfaceVariant
    val glow = MaterialTheme.colorScheme.onSurface
    Canvas(Modifier.fillMaxWidth().height(140.dp)) {
        val stroke = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round)
        val u = size.height / 10f // one unit
        val floor = size.height * 0.9f
        val cx = size.width / 2f
        drawLine(line.copy(alpha = 0.4f), Offset(cx - 9 * u, floor), Offset(cx + 9 * u, floor), strokeWidth = stroke.width, cap = StrokeCap.Round)
        // A chair seen from the side; [facing] = +1 faces right, -1 faces left.
        fun chair(x: Float, facing: Float) {
            val seatY = floor - 3.2f * u
            val back = x - facing * 1.8f * u
            val front = x + facing * 1.8f * u
            val path = Path().apply {
                moveTo(back, floor); lineTo(back, floor - 7f * u) // back post
                moveTo(back, seatY); lineTo(front, seatY) // seat
                moveTo(front, seatY); lineTo(front, floor) // front leg
            }
            drawPath(path, line, style = stroke)
        }
        chair(cx - 4.5f * u, +1f)
        chair(cx + 4.5f * u, -1f)
        // The soft light above the client's chair.
        val light = Offset(cx + 4.2f * u, floor - 5.6f * u)
        drawCircle(glow.copy(alpha = 0.08f), radius = 2.2f * u, center = light)
        drawCircle(glow.copy(alpha = 0.16f), radius = 1.4f * u, center = light)
        drawCircle(glow.copy(alpha = 0.55f), radius = 0.6f * u, center = light)
    }
}

@Composable
private fun Step(n: Int, title: StringResource, body: StringResource) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(
            Modifier.size(28.dp).background(MaterialTheme.colorScheme.primary, CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text("$n", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimary) }
        Column {
            Text(stringResource(title), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** O2 · Before we start. Must tick both boxes and confirm; can't be skipped (G3). */
@Composable
fun ConsentScreen(
    onAccept: () -> Unit,
    onPrivacy: () -> Unit,
    onHelp: () -> Unit,
    onLanguage: (AppLanguage) -> Unit,
) {
    var checked by rememberSaveable { mutableStateOf(false) }
    // Sharing with the AI service gets its own tick (Apple 5.1.2(i)), never bundled with the disclaimer.
    var aiAgreed by rememberSaveable { mutableStateOf(false) }
    OnboardingPage(
        page = 1,
        onSkip = null,
        onLanguage = onLanguage,
        bottom = {
            // Links, then the tick box, then the button (design O2).
            Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
                UnderlinedLink(stringResource(Res.string.onb_link_privacy), onPrivacy)
                UnderlinedLink(stringResource(Res.string.help_link), onHelp)
            }
            ConsentCheck(Res.string.onb_consent_check, checked) { checked = it }
            ConsentCheck(Res.string.onb_consent_ai_check, aiAgreed) { aiAgreed = it }
            PrimaryButton(stringResource(Res.string.onb_consent_accept), onAccept, enabled = checked && aiAgreed)
        },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).background(MaterialTheme.colorScheme.surfaceVariant, CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.Shield, contentDescription = null, modifier = Modifier.size(22.dp))
            }
            Text(stringResource(Res.string.onb_consent_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(20.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Point(1, Res.string.onb_consent_1_title, Res.string.onb_consent_1_body)
            Point(2, Res.string.onb_consent_2_title, Res.string.onb_consent_2_body)
            Point(3, Res.string.onb_consent_3_title, Res.string.onb_consent_3_body)
            Point(4, Res.string.onb_consent_4_title, Res.string.onb_consent_4_body)
            Point(5, Res.string.onb_consent_5_title, Res.string.onb_consent_5_body)
        }
    }
}

@Composable
private fun ConsentCheck(label: StringResource, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .toggleable(value = checked, onValueChange = onChange, role = Role.Checkbox)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = checked, onCheckedChange = null)
        Spacer(Modifier.width(12.dp))
        Text(stringResource(label), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun Point(n: Int, title: StringResource, body: StringResource) {
    GrayCard {
        Text("$n\u3000${stringResource(title)}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Text(stringResource(body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
