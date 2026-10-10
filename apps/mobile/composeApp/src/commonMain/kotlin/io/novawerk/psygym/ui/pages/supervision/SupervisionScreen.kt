package io.novawerk.psygym.ui.pages.supervision

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.m3.markdownTypography
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.supervision_again
import io.novawerk.psygym.resources.supervision_generating
import io.novawerk.psygym.resources.supervision_home
import io.novawerk.psygym.resources.supervision_note
import io.novawerk.psygym.resources.supervision_title
import io.novawerk.psygym.ui.components.DemoBadge
import io.novawerk.psygym.ui.components.ErrorCard
import io.novawerk.psygym.ui.locale.rememberApiLocale
import org.jetbrains.compose.resources.stringResource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupervisionScreen(
    viewModel: SupervisionViewModel,
    demoData: Boolean,
    onHome: () -> Unit,
    onPracticeAgain: () -> Unit,
    onSessionLost: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val locale = rememberApiLocale()
    LaunchedEffect(Unit) {
        // The app was restarted and the practice is gone: nothing to report on.
        if (viewModel.hasPractice) viewModel.start(locale) else onSessionLost()
    }
    val scroll = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.supervision_title)) },
                actions = { if (demoData) DemoBadge(Modifier.padding(end = 12.dp)) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
                Row(
                    Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(onClick = onHome, modifier = Modifier.weight(1f)) {
                        Text(stringResource(Res.string.supervision_home))
                    }
                    Button(onClick = onPracticeAgain, modifier = Modifier.weight(1f), enabled = !viewModel.streaming) {
                        Text(stringResource(Res.string.supervision_again))
                    }
                }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(horizontal = 20.dp, vertical = 12.dp),
        ) {
            Text(
                stringResource(Res.string.supervision_note),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            if (viewModel.report.isNotEmpty()) {
                val type = MaterialTheme.typography
                Markdown(
                    content = viewModel.report,
                    typography = markdownTypography(
                        h1 = type.headlineSmall,
                        h2 = type.titleLarge,
                        h3 = type.titleMedium,
                        h4 = type.titleSmall,
                        text = type.bodyLarge,
                        paragraph = type.bodyLarge,
                        bullet = type.bodyLarge,
                        list = type.bodyLarge,
                        ordered = type.bodyLarge,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (viewModel.streaming) {
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    Text(
                        stringResource(Res.string.supervision_generating),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            viewModel.error?.let { error ->
                Spacer(Modifier.height(12.dp))
                ErrorCard(
                    error = error,
                    onRetry = { viewModel.load(locale) },
                    onOpenSettings = onOpenSettings,
                    onBackToCases = onPracticeAgain,
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
