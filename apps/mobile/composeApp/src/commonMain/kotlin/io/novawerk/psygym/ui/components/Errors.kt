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
import io.novawerk.psygym.data.api.ApiErrorCode
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.error_case_not_found
import io.novawerk.psygym.resources.error_invalid_request
import io.novawerk.psygym.resources.error_invite_required
import io.novawerk.psygym.resources.error_model_unavailable
import io.novawerk.psygym.resources.error_network
import io.novawerk.psygym.resources.error_open_settings
import io.novawerk.psygym.resources.error_rate_limited
import io.novawerk.psygym.resources.error_unknown
import io.novawerk.psygym.resources.retry
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

fun ApiErrorCode.messageRes(): StringResource = when (this) {
    ApiErrorCode.InvalidRequest -> Res.string.error_invalid_request
    ApiErrorCode.InviteRequired -> Res.string.error_invite_required
    ApiErrorCode.CaseNotFound -> Res.string.error_case_not_found
    ApiErrorCode.RateLimited -> Res.string.error_rate_limited
    ApiErrorCode.ModelUnavailable -> Res.string.error_model_unavailable
    ApiErrorCode.Network -> Res.string.error_network
    ApiErrorCode.Unknown -> Res.string.error_unknown
}

/** A friendly error with the next step: retry, or Settings when the invite code is the problem. */
@Composable
fun ErrorCard(
    code: ApiErrorCode,
    onRetry: (() -> Unit)?,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
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
                Text(stringResource(code.messageRes()), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(end = 8.dp))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                if (code == ApiErrorCode.InviteRequired) {
                    TextButton(onClick = onOpenSettings) { Text(stringResource(Res.string.error_open_settings)) }
                }
                if (onRetry != null) {
                    TextButton(onClick = onRetry) { Text(stringResource(Res.string.retry)) }
                }
            }
        }
    }
}
