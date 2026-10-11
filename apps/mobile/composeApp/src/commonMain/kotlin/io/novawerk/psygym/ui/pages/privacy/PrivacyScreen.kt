package io.novawerk.psygym.ui.pages.privacy

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.privacy_a_collect
import io.novawerk.psygym.resources.privacy_a_device
import io.novawerk.psygym.resources.privacy_a_real
import io.novawerk.psygym.resources.privacy_a_store
import io.novawerk.psygym.resources.privacy_a_vendor
import io.novawerk.psygym.resources.privacy_a_where
import io.novawerk.psygym.resources.privacy_q_collect
import io.novawerk.psygym.resources.privacy_q_device
import io.novawerk.psygym.resources.privacy_q_real
import io.novawerk.psygym.resources.privacy_a_stats
import io.novawerk.psygym.resources.privacy_q_stats
import io.novawerk.psygym.resources.privacy_q_store
import io.novawerk.psygym.resources.privacy_q_vendor
import io.novawerk.psygym.resources.privacy_q_where
import io.novawerk.psygym.resources.privacy_title
import io.novawerk.psygym.resources.privacy_vendor
import io.novawerk.psygym.ui.components.BorderedCard
import org.jetbrains.compose.resources.stringResource

/** P3 · Privacy, as questions and short answers (screens.md). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrivacyScreen(onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.privacy_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Qa(stringResource(Res.string.privacy_q_where), stringResource(Res.string.privacy_a_where, stringResource(Res.string.privacy_vendor)))
            Qa(stringResource(Res.string.privacy_q_store), stringResource(Res.string.privacy_a_store))
            Qa(stringResource(Res.string.privacy_q_vendor), stringResource(Res.string.privacy_a_vendor))
            Qa(stringResource(Res.string.privacy_q_device), stringResource(Res.string.privacy_a_device))
            Qa(stringResource(Res.string.privacy_q_collect), stringResource(Res.string.privacy_a_collect))
            Qa(stringResource(Res.string.privacy_q_stats), stringResource(Res.string.privacy_a_stats))
            Qa(stringResource(Res.string.privacy_q_real), stringResource(Res.string.privacy_a_real))
        }
    }
}

@Composable
private fun Qa(q: String, a: String) {
    BorderedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(q, style = MaterialTheme.typography.titleSmall)
            Text(a, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
