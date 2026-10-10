package io.novawerk.psygym.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.error_back_to_cases
import io.novawerk.psygym.resources.error_case_not_found
import io.novawerk.psygym.resources.error_invalid_request
import io.novawerk.psygym.resources.error_invite_required
import io.novawerk.psygym.resources.error_model_unavailable
import io.novawerk.psygym.resources.error_network
import io.novawerk.psygym.resources.error_open_settings
import io.novawerk.psygym.resources.error_rate_limited
import io.novawerk.psygym.resources.error_rate_limited_seconds
import io.novawerk.psygym.resources.error_timeout
import io.novawerk.psygym.resources.error_unknown
import io.novawerk.psygym.resources.retry
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
 * A friendly error with the next step: Settings for a bad invite code, the case list for
 * a case that's gone, otherwise retry. Never shows codes or raw server text.
 */
@Composable
fun ErrorCard(
    error: ApiError,
    onRetry: (() -> Unit)?,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
    onBackToCases: (() -> Unit)? = null,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        ),
    ) {
        Column(Modifier.padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = 4.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Outlined.ErrorOutline, contentDescription = null)
                Text(error.message(), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(end = 8.dp))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                when {
                    error.code == ApiErrorCode.InviteRequired -> {
                        TextButton(onClick = onOpenSettings) { Text(stringResource(Res.string.error_open_settings)) }
                        if (onRetry != null) TextButton(onClick = onRetry) { Text(stringResource(Res.string.retry)) }
                    }
                    error.code == ApiErrorCode.CaseNotFound && onBackToCases != null ->
                        TextButton(onClick = onBackToCases) { Text(stringResource(Res.string.error_back_to_cases)) }
                    // Too long: retrying the same request can't help; the screen offers End.
                    error.code == ApiErrorCode.InvalidRequest -> Unit
                    onRetry != null -> TextButton(onClick = onRetry) { Text(stringResource(Res.string.retry)) }
                }
            }
        }
    }
}
