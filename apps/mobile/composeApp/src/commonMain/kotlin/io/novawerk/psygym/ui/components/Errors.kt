package io.novawerk.psygym.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.error_case_not_found
import io.novawerk.psygym.resources.error_invalid_request
import io.novawerk.psygym.resources.error_invite_required
import io.novawerk.psygym.resources.error_model_unavailable
import io.novawerk.psygym.resources.error_network
import io.novawerk.psygym.resources.error_open_settings
import io.novawerk.psygym.resources.error_other_case
import io.novawerk.psygym.resources.error_rate_limited
import io.novawerk.psygym.resources.error_rate_limited_seconds
import io.novawerk.psygym.resources.error_retry_in
import io.novawerk.psygym.resources.error_timeout
import io.novawerk.psygym.resources.error_unknown
import io.novawerk.psygym.resources.practice_end_confirm
import io.novawerk.psygym.resources.retry
import kotlinx.coroutines.delay
import org.jetbrains.compose.resources.stringResource

@Composable
fun ApiError.message(): String = when (code) {
    ApiErrorCode.InvalidRequest -> stringResource(Res.string.error_invalid_request)
    ApiErrorCode.InviteRequired -> stringResource(Res.string.error_invite_required)
    ApiErrorCode.CaseNotFound -> stringResource(Res.string.error_case_not_found)
    ApiErrorCode.RateLimited -> retryAfterSeconds
        ?.let { stringResource(Res.string.error_rate_limited_seconds, it) }
        ?: stringResource(Res.string.error_rate_limited)
    ApiErrorCode.ModelUnavailable -> stringResource(Res.string.error_model_unavailable)
    ApiErrorCode.Network -> stringResource(Res.string.error_network)
    ApiErrorCode.Timeout -> stringResource(Res.string.error_timeout)
    ApiErrorCode.Unknown -> stringResource(Res.string.error_unknown)
}

/**
 * Icon, one sentence, one button (screens.md, "错误"). The button is the next step:
 * Settings for a bad invite code, another case for a missing one, ending a session
 * that's too long, otherwise retry. Never shows codes or raw server text.
 */
@Composable
fun ErrorCard(
    error: ApiError,
    onRetry: (() -> Unit)?,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
    onOtherCase: (() -> Unit)? = null,
    onEndSession: (() -> Unit)? = null,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        ),
    ) {
        Column(Modifier.padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = 4.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Outlined.ErrorOutline, contentDescription = null, modifier = Modifier.size(20.dp))
                Text(error.message(), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(end = 8.dp))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                when {
                    error.code == ApiErrorCode.InviteRequired ->
                        TextButton(onClick = onOpenSettings) { Text(stringResource(Res.string.error_open_settings)) }
                    error.code == ApiErrorCode.CaseNotFound && onOtherCase != null ->
                        TextButton(onClick = onOtherCase) { Text(stringResource(Res.string.error_other_case)) }
                    error.code == ApiErrorCode.InvalidRequest && onEndSession != null ->
                        TextButton(onClick = onEndSession) { Text(stringResource(Res.string.practice_end_confirm)) }
                    error.code == ApiErrorCode.InvalidRequest -> Unit // retrying the same request can't help
                    error.code == ApiErrorCode.RateLimited && onRetry != null -> CountdownRetry(error.retryAfterSeconds, onRetry)
                    onRetry != null -> TextButton(onClick = onRetry) { Text(stringResource(Res.string.retry)) }
                }
            }
        }
    }
}

/** Retry that unlocks when Retry-After runs out. */
@Composable
private fun CountdownRetry(seconds: Int?, onRetry: () -> Unit) {
    var left by remember(seconds) { mutableIntStateOf(seconds ?: 0) }
    LaunchedEffect(seconds) {
        while (left > 0) {
            delay(1_000)
            left -= 1
        }
    }
    TextButton(onClick = onRetry, enabled = left == 0) {
        Text(if (left > 0) stringResource(Res.string.error_retry_in, left) else stringResource(Res.string.retry))
    }
}
