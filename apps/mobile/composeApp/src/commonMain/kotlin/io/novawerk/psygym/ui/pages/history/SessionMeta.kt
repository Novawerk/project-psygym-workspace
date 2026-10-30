package io.novawerk.psygym.ui.pages.history

import androidx.compose.runtime.Composable
import io.novawerk.psygym.domain.history.SavedSession
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.history_meta
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import io.novawerk.psygym.resources.turns_count
import io.novawerk.psygym.resources.voice_session_tag
import org.jetbrains.compose.resources.pluralStringResource
import org.jetbrains.compose.resources.stringResource
import kotlin.time.Instant

private val EN_MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

/** "10月10日 14:05" / "10 Oct 14:05". */
internal fun formatDateTime(millis: Long, locale: ApiLocale): String {
    val t = Instant.fromEpochMilliseconds(millis).toLocalDateTime(TimeZone.currentSystemDefault())
    val time = "${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}"
    return when (locale) {
        ApiLocale.Zh -> "${t.month.ordinal + 1}月${t.day}日 $time"
        ApiLocale.En -> "${t.day} ${EN_MONTHS[t.month.ordinal]} $time"
    }
}

/** Date and time · minutes · turns, and "Voice session" when it was one. */
@Composable
internal fun sessionMeta(session: SavedSession, locale: ApiLocale): String {
    val meta = stringResource(
        Res.string.history_meta,
        formatDateTime(session.startedAtMillis, locale),
        (session.durationMillis / 60_000).toInt().coerceAtLeast(1),
        pluralStringResource(Res.plurals.turns_count, session.turns, session.turns),
    )
    return if (session.voice) "$meta · ${stringResource(Res.string.voice_session_tag)}" else meta
}
