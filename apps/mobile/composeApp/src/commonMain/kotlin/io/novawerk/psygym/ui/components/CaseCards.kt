package io.novawerk.psygym.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.Difficulty
import io.novawerk.psygym.resources.brief_session_first
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.case_difficulty_hard
import io.novawerk.psygym.resources.case_title_with_alias
import io.novawerk.psygym.resources.case_difficulty_intro
import io.novawerk.psygym.resources.case_difficulty_medium
import io.novawerk.psygym.resources.cases_minutes
import io.novawerk.psygym.resources.cases_school_cbt
import org.jetbrains.compose.resources.stringResource

private val ZH_NUMERALS = listOf("一", "二", "三", "四", "五", "六", "七", "八", "九", "十")

/**
 * An abstract round mark: from the client's pseudonym (小林 → 林, Lin → L), or the case's
 * number when there is none. No faces, no photos (screens.md C1).
 */
@Composable
fun CaseAvatar(case: CaseSummary, index: Int, locale: ApiLocale, size: Dp = 44.dp) {
    val alias = case.clientAlias?.get(locale)?.trim()?.takeIf { it.isNotEmpty() }
    val label = when {
        alias != null -> avatarLetter(alias)
        locale == ApiLocale.Zh -> ZH_NUMERALS.getOrElse(index) { "${index + 1}" }
        else -> "${index + 1}"
    }
    Box(
        Modifier.size(size).background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
        contentAlignment = Alignment.Center,
    ) { Text(label, style = MaterialTheme.typography.titleMedium) }
}

/**
 * Chinese names: the last character (小林 → 林). Alphabetic scripts (Latin with accents,
 * Greek, Cyrillic): the first letter, upper case (Lin → L, Émile → É).
 */
fun avatarLetter(alias: String): String {
    val first = alias.first()
    // Everything alphabetic sits below the CJK blocks (U+2E80 on).
    val alphabetic = first.isLetter() && first.code < 0x2E80
    return if (alphabetic) first.uppercase() else alias.last().toString()
}

/** "小林 · 大学毕业后的低落" (copy.md case_title_with_alias), or just the title without a pseudonym. */
@Composable
fun CaseSummary.displayTitle(locale: ApiLocale): String {
    val alias = clientAlias?.get(locale)?.takeIf { it.isNotBlank() } ?: return title.get(locale)
    return stringResource(Res.string.case_title_with_alias, alias, title.get(locale))
}

/** Topic tags · difficulty · about N min · CBT. Missing fields are left out. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CaseTags(case: CaseSummary, locale: ApiLocale, firstSession: Boolean = false) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        // C2 only: every practice is a first session for now (S-1, copy.md).
        if (firstSession) Tag(stringResource(Res.string.brief_session_first))
        case.tags.forEach { Tag(it.get(locale)) }
        case.difficulty?.let {
            Tag(
                stringResource(
                    when (it) {
                        Difficulty.Intro -> Res.string.case_difficulty_intro
                        Difficulty.Medium -> Res.string.case_difficulty_medium
                        Difficulty.Hard -> Res.string.case_difficulty_hard
                    },
                ),
            )
        }
        case.estimatedMinutes?.let { Tag(stringResource(Res.string.cases_minutes, it)) }
        if (case.school == "cbt") Tag(stringResource(Res.string.cases_school_cbt))
    }
}

/** C1's card; [compact] is the narrower one on Home, with the mark above the title. */
@Composable
fun CaseCard(case: CaseSummary, index: Int, locale: ApiLocale, onClick: () -> Unit, modifier: Modifier = Modifier, compact: Boolean = false) {
    BorderedCard(modifier = modifier, onClick = onClick) {
        Column(Modifier.padding(16.dp)) {
            if (compact) {
                CaseAvatar(case, index, locale, size = 36.dp)
                Spacer(Modifier.height(10.dp))
                Text(case.displayTitle(locale), style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, minLines = 2)
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    CaseAvatar(case, index, locale)
                    Text(case.displayTitle(locale), style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                (case.clientIntro ?: case.summary).get(locale),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                minLines = if (compact) 2 else 1,
            )
            Spacer(Modifier.height(12.dp))
            CaseTags(case, locale)
        }
    }
}

/** Grey placeholder while cases load. */
@Composable
fun CaseCardSkeleton(modifier: Modifier = Modifier) {
    BorderedCard(modifier = modifier) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(40.dp).background(MaterialTheme.colorScheme.surfaceVariant, CircleShape))
                Box(Modifier.height(16.dp).fillMaxWidth(0.6f).background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small))
            }
            Box(Modifier.height(12.dp).fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small))
            Box(Modifier.height(12.dp).fillMaxWidth(0.8f).background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small))
        }
    }
}
