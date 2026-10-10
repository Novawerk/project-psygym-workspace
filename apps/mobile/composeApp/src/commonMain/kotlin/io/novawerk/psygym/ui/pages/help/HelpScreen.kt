package io.novawerk.psygym.ui.pages.help

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.close
import io.novawerk.psygym.resources.help_body
import io.novawerk.psygym.resources.help_hard_time
import io.novawerk.psygym.resources.help_practice_note
import io.novawerk.psygym.resources.help_title
import io.novawerk.psygym.ui.components.SafetyNote
import org.jetbrains.compose.resources.stringResource

/**
 * X1 · Need help? Opens any time, works offline. No hotline numbers until they are
 * verified (docs/safety.md §5), so only the general wording.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HelpScreen(onClose: () -> Unit) {
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
            SafetyNote {
                Text(stringResource(Res.string.help_body), style = MaterialTheme.typography.bodyLarge)
            }
            Text(stringResource(Res.string.help_hard_time), style = MaterialTheme.typography.bodyLarge)
            Text(
                stringResource(Res.string.help_practice_note),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
