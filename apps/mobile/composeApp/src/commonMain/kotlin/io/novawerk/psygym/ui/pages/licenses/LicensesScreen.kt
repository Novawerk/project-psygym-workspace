package io.novawerk.psygym.ui.pages.licenses

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.licenses_android_voice
import io.novawerk.psygym.resources.licenses_intro
import io.novawerk.psygym.resources.licenses_show_text
import io.novawerk.psygym.resources.settings_licenses
import io.novawerk.psygym.ui.components.GrayCard
import org.jetbrains.compose.resources.ExperimentalResourceApi
import org.jetbrains.compose.resources.stringResource

/** One component we ship, and the licence text file it's under (in composeResources/files/licenses). */
private data class Component(val name: String, val licence: String, val source: String, val file: String, val androidVoice: Boolean = false)

// Apache-2.0 §4 and MIT ask for the licence text (and notices) to travel with the app.
private val components = listOf(
    Component("sherpa-onnx 1.13.8", "Apache License 2.0", "github.com/k2-fsa/sherpa-onnx", "apache-2.0.txt", androidVoice = true),
    Component("ONNX Runtime", "MIT · © Microsoft Corporation", "github.com/microsoft/onnxruntime", "onnxruntime-mit.txt", androidVoice = true),
    Component("ONNX Runtime · third-party notices", "", "github.com/microsoft/onnxruntime", "onnxruntime-third-party-notices.txt", androidVoice = true),
    Component("X-ASR zh-en (speech model)", "Apache License 2.0", "github.com/Gilgamesh-J/X-ASR", "apache-2.0.txt", androidVoice = true),
    Component("Kotlin, kotlinx.coroutines, kotlinx.serialization, kotlinx-datetime", "Apache License 2.0", "github.com/JetBrains", "apache-2.0.txt"),
    Component("Compose Multiplatform, AndroidX", "Apache License 2.0", "github.com/JetBrains/compose-multiplatform", "apache-2.0.txt"),
    Component("Ktor", "Apache License 2.0", "github.com/ktorio/ktor", "apache-2.0.txt"),
    Component("Okio", "Apache License 2.0", "github.com/square/okio", "apache-2.0.txt"),
    Component("kotlin-inject", "Apache License 2.0", "github.com/evant/kotlin-inject", "apache-2.0.txt"),
    Component("multiplatform-markdown-renderer", "Apache License 2.0", "github.com/mikepenz/multiplatform-markdown-renderer", "apache-2.0.txt"),
)

/** Open-source licences: who made what we ship, and the full licence texts. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class)
@Composable
fun LicensesScreen(onBack: () -> Unit) {
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    BackHandler(enabled = open != null) { open = null }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.settings_licenses)) },
                navigationIcon = {
                    IconButton(onClick = { if (open != null) open = null else onBack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        val file = open
        if (file != null) {
            LicenceText(file, PaddingValues(start = 20.dp, end = 20.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp))
            return@Scaffold
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(stringResource(Res.string.licenses_intro), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            items(components) { c ->
                GrayCard(Modifier.clickable { open = c.file }) {
                    Text(c.name, style = MaterialTheme.typography.titleSmall)
                    if (c.licence.isNotEmpty()) Text(c.licence, style = MaterialTheme.typography.bodyMedium)
                    Text(c.source, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (c.androidVoice) {
                        Text(stringResource(Res.string.licenses_android_voice), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(stringResource(Res.string.licenses_show_text), style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

/** The licence text, in paragraphs so a long notice file scrolls smoothly. */
@OptIn(ExperimentalResourceApi::class)
@Composable
private fun LicenceText(file: String, padding: PaddingValues) {
    val paragraphs by produceState(emptyList<String>(), file) {
        value = Res.readBytes("files/licenses/$file").decodeToString().split(Regex("\n\\s*\n"))
    }
    LazyColumn(Modifier.fillMaxWidth(), contentPadding = padding, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(paragraphs) { p ->
            // The files are wrapped for 80 columns; let each paragraph wrap to the screen instead.
            Text(p.trim().replace(Regex("\\s*\n\\s*"), " "), style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(vertical = 2.dp))
        }
    }
}
