package io.novawerk.psygym

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import io.novawerk.psygym.di.AppComponent
import io.novawerk.psygym.domain.settings.AppLanguage
import io.novawerk.psygym.ui.locale.LocalAppLocale
import io.novawerk.psygym.ui.navigation.CasesRoute
import io.novawerk.psygym.ui.navigation.HomeRoute
import io.novawerk.psygym.ui.navigation.PracticeRoute
import io.novawerk.psygym.ui.navigation.SettingsRoute
import io.novawerk.psygym.ui.navigation.SupervisionRoute
import io.novawerk.psygym.ui.pages.cases.CasesScreen
import io.novawerk.psygym.ui.pages.cases.CasesViewModel
import io.novawerk.psygym.ui.pages.home.HomeScreen
import io.novawerk.psygym.ui.pages.practice.PracticeScreen
import io.novawerk.psygym.ui.pages.practice.PracticeViewModel
import io.novawerk.psygym.ui.pages.settings.SettingsScreen
import io.novawerk.psygym.ui.pages.supervision.SupervisionScreen
import io.novawerk.psygym.ui.pages.supervision.SupervisionViewModel
import io.novawerk.psygym.ui.theme.PsygymTheme
import kotlinx.coroutines.launch

@Composable
fun App(component: AppComponent) {
    val settings = component.settingsRepository
    val scope = rememberCoroutineScope()

    // Null until DataStore answers, so we never flash the wrong language or prompt.
    val language by settings.language.collectAsState(initial = null)
    val inviteCode by settings.inviteCode.collectAsState(initial = "")
    val invitePrompted by settings.invitePrompted.collectAsState(initial = null)
    val demoData by settings.useFakeApi.collectAsState(initial = BuildKonfig.USE_FAKE_API)

    // Outside key(lang): switching language rebuilds the UI but keeps the back stack.
    val nav = rememberNavController()
    val lang = language ?: return
    CompositionLocalProvider(LocalAppLocale provides lang.tag) {
        key(lang) {
            PsygymTheme {
                val openSettings = { nav.navigate(SettingsRoute) { launchSingleTop = true } }
                val goHome = {
                    component.practiceSession.clear()
                    nav.popBackStack(HomeRoute, inclusive = false)
                    Unit
                }

                NavHost(navController = nav, startDestination = HomeRoute) {
                    composable<HomeRoute> {
                        HomeScreen(
                            demoData = demoData,
                            askForInvite = invitePrompted == false && inviteCode.isBlank(),
                            onStart = { nav.navigate(CasesRoute) },
                            onOpenSettings = openSettings,
                            onSaveInvite = { scope.launch { settings.setInviteCode(it) } },
                            onSkipInvite = { scope.launch { settings.markInvitePrompted() } },
                        )
                    }
                    composable<CasesRoute> {
                        val vm = viewModel { CasesViewModel(component.api) }
                        CasesScreen(
                            viewModel = vm,
                            demoData = demoData,
                            onBack = { nav.popBackStack() },
                            onPick = { case ->
                                component.practiceSession.start(case)
                                nav.navigate(PracticeRoute)
                            },
                            onOpenSettings = openSettings,
                        )
                    }
                    composable<PracticeRoute> {
                        val vm = viewModel { PracticeViewModel(component.api, component.practiceSession) }
                        PracticeScreen(
                            viewModel = vm,
                            onLeave = { nav.popBackStack() },
                            onEnd = {
                                nav.navigate(SupervisionRoute) { popUpTo(CasesRoute) }
                            },
                            onOpenSettings = openSettings,
                        )
                    }
                    composable<SupervisionRoute> {
                        val vm = viewModel { SupervisionViewModel(component.api, component.practiceSession) }
                        SupervisionScreen(
                            viewModel = vm,
                            demoData = demoData,
                            onHome = {
                                vm.finish()
                                goHome()
                            },
                            onPracticeAgain = {
                                vm.finish()
                                nav.popBackStack(CasesRoute, inclusive = false)
                            },
                            onOpenSettings = openSettings,
                        )
                    }
                    composable<SettingsRoute> {
                        SettingsScreen(
                            language = lang,
                            inviteCode = inviteCode,
                            useFakeApi = demoData,
                            onLanguageChange = { scope.launch { settings.setLanguage(it) } },
                            onInviteCodeSave = { scope.launch { settings.setInviteCode(it) } },
                            onUseFakeApiChange = { scope.launch { settings.setUseFakeApi(it) } },
                            onBack = { nav.popBackStack() },
                        )
                    }
                }
            }
        }
    }
}
