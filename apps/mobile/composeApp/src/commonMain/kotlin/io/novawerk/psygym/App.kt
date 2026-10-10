package io.novawerk.psygym

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import io.novawerk.psygym.di.AppComponent
import io.novawerk.psygym.domain.settings.AppLanguage
import io.novawerk.psygym.ui.locale.LocalAppLocale
import io.novawerk.psygym.ui.navigation.BriefingRoute
import io.novawerk.psygym.ui.navigation.CasesRoute
import io.novawerk.psygym.ui.navigation.HomeRoute
import io.novawerk.psygym.ui.navigation.PracticeRoute
import io.novawerk.psygym.ui.navigation.SettingsRoute
import io.novawerk.psygym.ui.navigation.SupervisionRoute
import io.novawerk.psygym.ui.pages.briefing.BriefingScreen
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
    val demoData by settings.useFakeApi.collectAsState(initial = AppConfig.fakeApiDefault)

    // Outside key(lang): switching language rebuilds the UI but keeps the back stack.
    val nav = rememberNavController()
    var practiceInterrupted by remember { mutableStateOf(false) }
    val lang = language ?: return
    CompositionLocalProvider(LocalAppLocale provides lang.tag) {
        key(lang) {
            PsygymTheme {
                val openSettings = { nav.navigate(SettingsRoute) { launchSingleTop = true } }
                // The app was restarted mid-practice; the in-memory session is gone (D8).
                val sessionLost = {
                    practiceInterrupted = true
                    if (!nav.popBackStack(CasesRoute, inclusive = false)) nav.navigate(CasesRoute)
                    Unit
                }
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
                            interrupted = practiceInterrupted,
                            onInterruptedShown = { practiceInterrupted = false },
                            onBack = { nav.popBackStack() },
                            onPick = { case ->
                                component.practiceSession.start(case)
                                nav.navigate(BriefingRoute)
                            },
                            onOpenSettings = openSettings,
                        )
                    }
                    composable<BriefingRoute> {
                        BriefingScreen(
                            case = component.practiceSession.case,
                            onAccept = { nav.navigate(PracticeRoute) { popUpTo(CasesRoute) } },
                            onBack = { nav.popBackStack() },
                            onSessionLost = sessionLost,
                        )
                    }
                    composable<PracticeRoute> {
                        val vm = viewModel { PracticeViewModel(component.api, component.practiceSession) }
                        PracticeScreen(
                            viewModel = vm,
                            onLeave = { nav.popBackStack() },
                            onSessionLost = sessionLost,
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
                            onSessionLost = sessionLost,
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
