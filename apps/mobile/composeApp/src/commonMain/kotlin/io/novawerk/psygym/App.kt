package io.novawerk.psygym

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import io.novawerk.psygym.di.AppComponent
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.settings.StartState
import io.novawerk.psygym.ui.locale.LocalAppLocale
import io.novawerk.psygym.ui.navigation.BriefingRoute
import io.novawerk.psygym.ui.navigation.CasesRoute
import io.novawerk.psygym.ui.navigation.ConsentRoute
import io.novawerk.psygym.ui.navigation.HelpRoute
import io.novawerk.psygym.ui.navigation.HomeRoute
import io.novawerk.psygym.ui.navigation.PracticeRoute
import io.novawerk.psygym.ui.navigation.PrivacyRoute
import io.novawerk.psygym.ui.navigation.ReadyRoute
import io.novawerk.psygym.ui.navigation.HistoryDetailRoute
import io.novawerk.psygym.ui.navigation.HistoryRoute
import io.novawerk.psygym.ui.navigation.MeRoute
import io.novawerk.psygym.ui.navigation.SettingsRoute
import io.novawerk.psygym.ui.navigation.SupervisionRoute
import io.novawerk.psygym.ui.navigation.WelcomeRoute
import io.novawerk.psygym.ui.pages.briefing.BriefingScreen
import io.novawerk.psygym.ui.pages.cases.CasesScreen
import io.novawerk.psygym.ui.pages.help.HelpScreen
import io.novawerk.psygym.ui.pages.home.HomeScreen
import io.novawerk.psygym.ui.pages.onboarding.ConsentScreen
import io.novawerk.psygym.ui.pages.onboarding.ReadyScreen
import io.novawerk.psygym.ui.pages.onboarding.WelcomeScreen
import io.novawerk.psygym.ui.pages.practice.PracticeScreen
import io.novawerk.psygym.ui.pages.practice.PracticeViewModel
import io.novawerk.psygym.ui.pages.privacy.PrivacyScreen
import io.novawerk.psygym.ui.pages.history.HistoryDetailScreen
import io.novawerk.psygym.ui.pages.history.HistoryScreen
import io.novawerk.psygym.ui.pages.me.MeScreen
import io.novawerk.psygym.ui.components.TopTab
import io.novawerk.psygym.ui.pages.supervision.SupervisionScreen
import io.novawerk.psygym.ui.pages.supervision.SupervisionViewModel
import io.novawerk.psygym.ui.theme.PsygymTheme
import kotlinx.coroutines.launch

@Composable
fun App(component: AppComponent) {
    val settings = component.settingsRepository
    val session = component.practiceSession
    val caseStore = component.caseStore
    val scope = rememberCoroutineScope()

    // Null until DataStore answers, so we never flash the wrong language or start page.
    val language by settings.language.collectAsState(initial = null)
    val startState by settings.startState.collectAsState(initial = null)
    val inviteCode by settings.inviteCode.collectAsState(initial = "")
    val realInfoHintSeen by settings.realInfoHintSeen.collectAsState(initial = true)
    val demoData by settings.useFakeApi.collectAsState(initial = AppConfig.fakeApiDefault)
    val saveHistory by settings.saveHistory.collectAsState(initial = true)
    val history = component.history
    val savedSessions by history.sessions.collectAsState()

    // Outside key(lang): switching language rebuilds the UI but keeps the back stack.
    val nav = rememberNavController()
    var practiceInterrupted by remember { mutableStateOf(false) }

    // Cases come from whichever backend is active, with the current invite code: reload when
    // either changes (the code is often entered after the first, failed, fetch).
    LaunchedEffect(demoData, inviteCode) { caseStore.load(force = true) }
    LaunchedEffect(Unit) { history.load() }

    val lang = language ?: return
    // The start page is picked once, from the first value DataStore gives; later changes
    // (finishing the intro) navigate instead. Keyed on "has it arrived": a plain remember
    // would keep the null from before DataStore answered, and the app would stay blank.
    val start = remember(startState != null) { startState } ?: return
    CompositionLocalProvider(LocalAppLocale provides lang.tag) {
        key(lang) {
            PsygymTheme {
                val setLanguage: (io.novawerk.psygym.domain.settings.AppLanguage) -> Unit =
                    { scope.launch { settings.setLanguage(it) } }
                // From an error card (e.g. invite_required): push Me on top so Back returns to the
                // session or report, ViewModels intact (acceptance D2). openTab is for the bar only.
                val openSettings = { nav.navigate(SettingsRoute) { launchSingleTop = true } }
                val onTab = { tab: TopTab -> nav.openTab(tab) }
                val openHelp = { nav.navigate(HelpRoute) { launchSingleTop = true } }
                val goHome = { nav.goHome() }
                val openCase = { case: CaseSummary ->
                    session.select(case)
                    nav.navigate(BriefingRoute)
                }
                // The app was restarted mid-practice; the in-memory session is gone (D8).
                val sessionLost = {
                    practiceInterrupted = true
                    nav.navigate(CasesRoute) { popUpTo(HomeRoute) }
                }
                val caseIndex = { case: CaseSummary? -> caseStore.cases?.indexOfFirst { it.id == case?.id }?.coerceAtLeast(0) ?: 0 }

                val meScreen: @Composable (onBack: (() -> Unit)?) -> Unit = { onBack ->
                    MeScreen(
                        language = lang,
                        inviteCode = inviteCode,
                        saveHistory = saveHistory,
                        useFakeApi = demoData,
                        onLanguageChange = setLanguage,
                        onInviteCodeSave = { scope.launch { settings.setInviteCode(it) } },
                        onSaveHistoryChange = { scope.launch { settings.setSaveHistory(it) } },
                        onDeleteAllHistory = { scope.launch { history.deleteAll() } },
                        onUseFakeApiChange = { scope.launch { settings.setUseFakeApi(it) } },
                        onReplayOnboarding = { nav.navigate(WelcomeRoute) },
                        onHelp = openHelp,
                        onPrivacy = { nav.navigate(PrivacyRoute) },
                        onTab = onTab,
                        onBack = onBack,
                    )
                }
                // On a tablet, keep lines readable: content capped at 640dp, centred.
                Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.TopCenter) {
                NavHost(
                    modifier = Modifier.widthIn(max = 640.dp).fillMaxSize(),
                    navController = nav,
                    startDestination = when (start) {
                        StartState.Welcome -> WelcomeRoute
                        StartState.Consent -> ConsentRoute(thenReady = false)
                        StartState.Home -> HomeRoute
                    },
                ) {
                    composable<WelcomeRoute> {
                        WelcomeScreen(
                            onContinue = { nav.navigate(ConsentRoute()) },
                            // Skip goes to O2: it can't be skipped.
                            onSkip = { nav.navigate(ConsentRoute()) },
                            onLanguage = setLanguage,
                        )
                    }
                    composable<ConsentRoute> { entry ->
                        val thenReady = entry.toRoute<ConsentRoute>().thenReady
                        ConsentScreen(
                            onAccept = {
                                scope.launch { settings.acceptDisclaimer() }
                                if (thenReady) nav.navigate(ReadyRoute) else nav.finishIntro()
                            },
                            onPrivacy = { nav.navigate(PrivacyRoute) },
                            onHelp = openHelp,
                            onLanguage = setLanguage,
                        )
                    }
                    composable<ReadyRoute> {
                        val finish = { code: String? ->
                            scope.launch {
                                // Start saves what's in the field, including clearing it; Skip keeps the old code.
                                if (code != null) settings.setInviteCode(code)
                                settings.finishOnboarding()
                            }
                            nav.finishIntro()
                        }
                        ReadyScreen(
                            language = lang,
                            inviteCode = inviteCode,
                            onLanguage = setLanguage,
                            onStart = { finish(it) },
                            onSkip = { finish(null) },
                        )
                    }
                    composable<HomeRoute> {
                        HomeScreen(
                            demoData = demoData,
                            cases = caseStore.cases,
                            casesError = caseStore.error,
                            onStart = { nav.navigate(CasesRoute) },
                            onPickCase = openCase,
                            onAllCases = { nav.navigate(CasesRoute) },
                            onRetryCases = { caseStore.load(force = true) },
                            onOpenSettings = openSettings,
                            onHelp = openHelp,
                            onTab = onTab,
                        )
                    }
                    composable<HistoryRoute> {
                        HistoryScreen(
                            sessions = savedSessions,
                            onOpen = { nav.navigate(HistoryDetailRoute(it.id)) },
                            onDelete = { scope.launch { history.delete(it.id) } },
                            onStartPractice = { nav.navigate(CasesRoute) },
                            onTab = onTab,
                        )
                    }
                    composable<HistoryDetailRoute> { entry ->
                        val id = entry.toRoute<HistoryDetailRoute>().id
                        val saved = savedSessions?.firstOrNull { it.id == id }
                        HistoryDetailScreen(
                            session = saved,
                            onBack = { nav.popBackStack() },
                            onDelete = {
                                scope.launch { history.delete(id) }
                                nav.popBackStack()
                            },
                            onPracticeAgain = { saved?.let { openCase(it.case) } },
                        )
                    }
                    composable<CasesRoute> {
                        LaunchedEffect(Unit) { caseStore.load() }
                        CasesScreen(
                            cases = caseStore.cases,
                            error = caseStore.error,
                            demoData = demoData,
                            interrupted = practiceInterrupted,
                            onInterruptedShown = { practiceInterrupted = false },
                            onBack = { if (!nav.popBackStack()) goHome() },
                            onPick = openCase,
                            onRetry = { caseStore.load(force = true) },
                            onOpenSettings = openSettings,
                        )
                    }
                    composable<BriefingRoute> {
                        BriefingScreen(
                            case = session.case,
                            caseIndex = caseIndex(session.case),
                            onStart = { nav.navigate(PracticeRoute) },
                            onBack = { nav.popBackStack() },
                            onHelp = openHelp,
                            onSessionLost = sessionLost,
                        )
                    }
                    composable<PracticeRoute> {
                        val vm = viewModel { PracticeViewModel(component.api, session) }
                        PracticeScreen(
                            viewModel = vm,
                            elapsed = { session.elapsed },
                            showRealInfoHint = !realInfoHintSeen,
                            saveHistory = saveHistory,
                            onLeave = {
                                // Nothing kept: coming back starts a fresh session (timer, messages).
                                session.finish()
                                nav.popBackStack()
                            },
                            onSessionLost = sessionLost,
                            onEnd = { nav.navigate(SupervisionRoute) { popUpTo(BriefingRoute) { inclusive = true } } },
                            onHelp = openHelp,
                            onOpenSettings = openSettings,
                            onOtherCase = { nav.navigate(CasesRoute) { popUpTo(HomeRoute) } },
                        )
                    }
                    composable<SupervisionRoute> {
                        val vm = viewModel { SupervisionViewModel(component.api, session, history.takeIf { saveHistory }) }
                        SupervisionScreen(
                            viewModel = vm,
                            demoData = demoData,
                            onShown = { scope.launch { settings.markRealInfoHintSeen() } },
                            onHome = {
                                vm.finish()
                                goHome()
                            },
                            onPracticeAgain = {
                                vm.finish()
                                nav.navigate(BriefingRoute) { popUpTo(HomeRoute) }
                            },
                            onOtherCase = {
                                vm.finish()
                                nav.navigate(CasesRoute) { popUpTo(HomeRoute) }
                            },
                            onSessionLost = sessionLost,
                            onHelp = openHelp,
                            onOpenSettings = openSettings,
                        )
                    }
                    composable<HelpRoute> { HelpScreen(onClose = { nav.popBackStack() }) }
                    composable<PrivacyRoute> { PrivacyScreen(onBack = { nav.popBackStack() }) }
                    composable<MeRoute> { meScreen(null) }
                    composable<SettingsRoute> { meScreen { nav.popBackStack() } }
                }
                }
            }
        }
    }
}

/** Top-level pages swap in place: Home stays at the bottom of the stack, the others replace each other. */
private fun NavHostController.openTab(tab: TopTab) {
    when (tab) {
        TopTab.Practice -> goHome()
        TopTab.History -> navigate(HistoryRoute) { popUpTo(HomeRoute); launchSingleTop = true }
        TopTab.Me -> navigate(MeRoute) { popUpTo(HomeRoute); launchSingleTop = true }
    }
}

/** Back to home with nothing above it. Home may not be in the stack yet (after the intro). */
private fun NavHostController.goHome() {
    if (!popBackStack(HomeRoute, inclusive = false)) {
        navigate(HomeRoute) { popUpTo(graph.id) { inclusive = true } }
    }
}

/** The intro is done (or the disclaimer re-accepted): home, with the intro off the stack. */
private fun NavHostController.finishIntro() {
    navigate(HomeRoute) { popUpTo(graph.id) { inclusive = true } }
}
