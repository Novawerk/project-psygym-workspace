package io.novawerk.psygym.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.tab_history
import io.novawerk.psygym.resources.tab_me
import io.novawerk.psygym.resources.tab_practice
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

/** The three top-level pages. Only they show the bar (information-architecture.md). */
enum class TopTab(val label: StringResource, val icon: ImageVector) {
    Practice(Res.string.tab_practice, Icons.Outlined.ChatBubbleOutline),
    History(Res.string.tab_history, Icons.Outlined.Description),
    Me(Res.string.tab_me, Icons.Outlined.Person),
}

@Composable
fun BottomBar(current: TopTab, onSelect: (TopTab) -> Unit) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.background, tonalElevation = androidx.compose.ui.unit.Dp.Hairline) {
        TopTab.entries.forEach { tab ->
            NavigationBarItem(
                selected = tab == current,
                onClick = { if (tab != current) onSelect(tab) },
                icon = { Icon(tab.icon, contentDescription = null) },
                label = { Text(stringResource(tab.label)) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.onSurface,
                    selectedTextColor = MaterialTheme.colorScheme.onSurface,
                    indicatorColor = MaterialTheme.colorScheme.surfaceVariant,
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
        }
    }
}
