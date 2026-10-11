package io.novawerk.psygym

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
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
import androidx.navigation.NavGraph
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.toRoute
import androidx.compose.ui.backhandler.BackHandler
import io.novawerk.psygym.data.api.ApiError
import io.novawerk.psygym.data.api.ApiException
import io.novawerk.psygym.data.api.toError
import io.novawerk.psygym.di.AppComponent
import io.novawerk.psygym.domain.auth.LoginFlow
import io.novawerk.psygym.domain.auth.LoginStep
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.delete_done
import io.novawerk.psygym.resources.error_session_expired
import io.novawerk.psygym.resources.login_migration_note
import io.novawerk.psygym.ui.pages.account.DeleteAccountScreen
import io.novawerk.psygym.ui.pages.login.LoginCodeScreen
import io.novawerk.psygym.ui.pages.login.LoginEmailScreen
import io.novawerk.psygym.ui.pages.login.LoginInviteScreen
import io.novawerk.psygym.ui.pages.login.LoginViewModel
import org.jetbrains.compose.resources.stringResource
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.settings.StartState
import io.novawerk.psygym.ui.locale.LocalAppLocale
import io.novawerk.psygym.ui.locale.rememberApiLocale
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
import io.novawerk.psygym.ui.navigation.LoginRoute
import io.novawerk.psygym.ui.navigation.DeleteAccountRoute
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

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun App(component: AppComponent) {
    val settings = component.settingsRepository
    val session = component.practiceSession
    val caseStore = component.caseStore
    val sessions = component.sessions
    val scope = rememberCoroutineScope()

    // Null until DataStore answers, so we never flash the wrong language or start page.
    val language by settings.language.collectAsState(initial = null)
    val startState by settings.startState.collectAsState(initial = null)
    val signedInOnce by settings.signedInOnce.collectAsState(initial = null)
    // The signed-in account (login.md). The app always signs in; screenshot mode never does.
    val stored by sessions.session.collectAsState()
    val sessionsLoaded by sessions.loaded.collectAsState()
    val expired by sessions.expired.collectAsState()
    val realInfoHintSeen by settings.realInfoHintSeen.collectAsState(initial = true)
    val demoData by settings.useFakeApi.collectAsState(initial = AppConfig.fakeApiDefault)
    // Store-screenshot mode (Android debug builds only): no demo badges, written sessions.
    val shot = component.screenshot.mode
    val demoBadge = demoData && shot == null
    val saveHistory by settings.saveHistory.collectAsState(initial = true)
    val history = component.history
    val savedSessions by history.sessions.collectAsState()

    // Outside key(lang): switching language rebuilds the UI but keeps the back stack.
    val nav = rememberNavController()
    // "We couldn't keep your last session", shown once on Home (audit O).
    var practiceLost by remember { mutableStateOf(false) }
    var historyDeleted by remember { mutableStateOf(false) }

    // Cases come from whichever backend is active, for the signed-in account: reload when either
    // changes. Never without a session: the server would refuse, and that reads as "expired".
    LaunchedEffect(demoData, stored?.token) { if (stored != null || shot != null) caseStore.load(force = true) }
    // The list shows the signed-in account's sessions only.
    LaunchedEffect(sessionsLoaded, stored?.accountKey) { if (sessionsLoaded) history.setOwner(stored?.accountKey) }
    LaunchedEffect(Unit) {
        // iOS keeps Keychain items across a reinstall: a fresh install starts signed out.
        if (settings.consumeFirstLaunch()) sessions.clear()
        sessions.load()
        // A session was open when the process died: the in-memory practice is gone. Never in
        // screenshot mode, so the notice can't end up in a store screenshot.
        if (shot == null && session.case == null && settings.consumePracticeInProgress()) practiceLost = true
    }

    val lang = language ?: return
    if (!sessionsLoaded) return
    val signedInBefore = signedInOnce ?: return
    // The start page is picked once, from the first value DataStore gives; later changes
    // (finishing the intro) navigate instead. Keyed on "has it arrived": a plain remember
    // would keep the null from before DataStore answered, and the app would stay blank.
    val start = remember(startState != null) { startState } ?: return
    CompositionLocalProvider(LocalAppLocale provides lang.tag) {
        key(lang) {
            PsygymTheme {
                val apiLocale = rememberApiLocale()
                val setLanguage: (io.novawerk.psygym.domain.settings.AppLanguage) -> Unit =
                    { scope.launch { settings.setLanguage(it) } }
                val onTab = { tab: TopTab -> nav.openTab(tab) }
                val openHelp = { nav.navigate(HelpRoute) { launchSingleTop = true } }
                val goHome = { nav.goHome() }
                val openCase = { case: CaseSummary ->
                    session.select(case)
                    nav.navigate(BriefingRoute)
                }
                // The app was restarted mid-practice; the in-memory session is gone (D8).
                val sessionLost = {
                    practiceLost = true
                    scope.launch { settings.setPracticeInProgress(false) }
                    nav.goHome()
                }
                val caseIndex = { case: CaseSummary? -> caseStore.cases?.indexOfFirst { it.id == case?.id }?.coerceAtLeast(0) ?: 0 }

                // After the intro: home when signed in, else sign-in (with O3 still behind it).
                val afterIntro = {
                    if (stored != null || shot != null) nav.finishIntro() else nav.navigate(LoginRoute())
                }
                val signOut = {
                    scope.launch {
                        // Best effort: the server forgets the session; the phone forgets it anyway.
                        try {
                            component.auth.signOut()
                        } catch (e: ApiException) {
                            // offline or already expired: nothing to undo
                        }
                        sessions.clear()
                    }
                    nav.navigate(LoginRoute()) { popUpTo(nav.graph.id) { inclusive = true } }
                }
                val meScreen: @Composable () -> Unit = {
                    MeScreen(
                        language = lang,
                        email = stored?.email,
                        saveHistory = saveHistory,
                        useFakeApi = demoData,
                        onLanguageChange = setLanguage,
                        onSignOut = { signOut() },
                        onDeleteAccount = { nav.navigate(DeleteAccountRoute) },
                        onSaveHistoryChange = { scope.launch { settings.setSaveHistory(it) } },
                        onDeleteAllHistory = { scope.launch { history.deleteAll() } },
                        onUseFakeApiChange = { scope.launch { settings.setUseFakeApi(it) } },
                        onReplayOnboarding = { nav.navigate(WelcomeRoute) },
                        onHelp = openHelp,
                        onPrivacy = { nav.navigate(PrivacyRoute) },
                        onTab = onTab,
                    )
                }
                // On a tablet, keep lines readable: content capped at 640dp, centred.
                Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.TopCenter) {
                NavHost(
                    modifier = Modifier.widthIn(max = 640.dp).fillMaxSize(),
                    navController = nav,
                    startDestination = remember {
                        when {
                            shot != null -> HomeRoute
                            start == StartState.Welcome -> WelcomeRoute
                            start == StartState.Consent -> ConsentRoute(thenReady = false)
                            stored != null -> HomeRoute
                            // Finished the intro in the version without sign-in: straight to L1, with a word why.
                            !signedInBefore -> LoginRoute(notice = LoginRoute.NOTICE_MIGRATION)
                            else -> LoginRoute()
                        }
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
                                if (thenReady) nav.navigate(ReadyRoute) else afterIntro()
                            },
                            onPrivacy = { nav.navigate(PrivacyRoute) },
                            onHelp = openHelp,
                            onLanguage = setLanguage,
                        )
                    }
                    composable<ReadyRoute> {
                        ReadyScreen(
                            language = lang,
                            onLanguage = setLanguage,
                            onContinue = {
                                scope.launch { settings.finishOnboarding() }
                                afterIntro()
                            },
                        )
                    }
                    composable<LoginRoute> { entry ->
                        val route = entry.toRoute<LoginRoute>()
                        val vm = viewModel {
                            LoginViewModel(LoginFlow(component.auth, sessions, settings::legacyInviteCode, settings::clearLegacyInviteCode))
                        }
                        val flow = vm.flow
                        LaunchedEffect(flow.step) {
                            if (flow.step != LoginStep.Done) return@LaunchedEffect
                            settings.markSignedIn()
                            // Expired mid-use: back to that page, its state intact. Otherwise home.
                            if (route.returnBack && nav.previousBackStackEntry?.destination.let { it != null && it !is NavGraph }) nav.popBackStack() else nav.finishIntro()
                        }
                        // System back steps back through the three screens.
                        BackHandler(enabled = flow.step == LoginStep.Code || flow.step == LoginStep.Invite) {
                            if (flow.step == LoginStep.Invite) flow.backToCode() else flow.backToEmail()
                        }
                        when (flow.step) {
                            LoginStep.Email -> LoginEmailScreen(
                                flow = flow,
                                notice = when (route.notice) {
                                    LoginRoute.NOTICE_MIGRATION -> stringResource(Res.string.login_migration_note)
                                    LoginRoute.NOTICE_EXPIRED -> stringResource(Res.string.error_session_expired)
                                    LoginRoute.NOTICE_DELETED -> stringResource(Res.string.delete_done)
                                    else -> null
                                },
                                // A back arrow only with a page behind (O3, or the page whose session expired).
                                onBack = if (nav.previousBackStackEntry?.destination.let { it != null && it !is NavGraph }) ({ nav.popBackStack() }) else null,
                                onLanguage = setLanguage,
                                onPrivacy = { nav.navigate(PrivacyRoute) },
                            )
                            LoginStep.Code -> LoginCodeScreen(flow, onChangeEmail = flow::backToEmail)
                            LoginStep.Invite -> LoginInviteScreen(flow, onBack = flow::backToCode, onNoInvite = flow::backToEmail)
                            LoginStep.Done -> Unit
                        }
                    }
                    composable<DeleteAccountRoute> {
                        var deleting by remember { mutableStateOf(false) }
                        var error by remember { mutableStateOf<ApiError?>(null) }
                        DeleteAccountScreen(
                            email = stored?.email.orEmpty(),
                            deleting = deleting,
                            error = error,
                            onDelete = {
                                val account = stored ?: return@DeleteAccountScreen
                                scope.launch {
                                    deleting = true
                                    error = null
                                    try {
                                        component.auth.deleteAccount()
                                        // This account's history goes too (login.md: no choice).
                                        history.deleteAccount(account.accountKey)
                                        sessions.clear()
                                        nav.navigate(LoginRoute(notice = LoginRoute.NOTICE_DELETED)) { popUpTo(nav.graph.id) { inclusive = true } }
                                    } catch (e: ApiException) {
                                        // Offline: nothing is cleared (login.md).
                                        error = e.toError()
                                    } finally {
                                        deleting = false
                                    }
                                }
                            },
                            onBack = { nav.popBackStack() },
                        )
                    }
                    composable<HomeRoute> {
                        HomeScreen(
                            demoData = demoBadge,
                            cases = caseStore.cases,
                            casesError = caseStore.error,
                            onStart = { nav.navigate(CasesRoute) },
                            onPickCase = openCase,
                            onAllCases = { nav.navigate(CasesRoute) },
                            onRetryCases = { caseStore.load(force = true) },
                            onHelp = openHelp,
                            onTab = onTab,
                            practiceLost = practiceLost,
                            onPracticeLostShown = { practiceLost = false },
                        )
                    }
                    composable<HistoryRoute> {
                        HistoryScreen(
                            sessions = savedSessions,
                            onOpen = { nav.navigate(HistoryDetailRoute(it.id)) },
                            onDelete = {
                                scope.launch { history.delete(it.id) }
                                historyDeleted = true
                            },
                            deleted = historyDeleted,
                            onDeletedShown = { historyDeleted = false },
                            onStartPractice = { nav.navigate(CasesRoute) },
                            onTab = onTab,
                        )
                    }
                    composable<HistoryDetailRoute> { entry ->
                        val id = entry.toRoute<HistoryDetailRoute>().id
                        val saved = savedSessions?.firstOrNull { it.id == id }
                        // Pop only while this page is on top: after a delete the record turns null and
                        // the screen asks to go back again, which used to pop History too (audit B).
                        val back = { if (nav.currentBackStackEntry?.destination?.hasRoute<HistoryDetailRoute>() == true) nav.popBackStack() }
                        HistoryDetailScreen(
                            session = saved,
                            onBack = { back() },
                            onDelete = {
                                scope.launch { history.delete(id) }
                                historyDeleted = true
                                back()
                            },
                            onPracticeAgain = { saved?.let { openCase(it.case) } },
                        )
                    }
                    composable<CasesRoute> {
                        LaunchedEffect(Unit) { caseStore.load() }
                        CasesScreen(
                            cases = caseStore.cases,
                            error = caseStore.error,
                            demoData = demoBadge,
                            onBack = { if (!nav.popBackStack()) goHome() },
                            onPick = openCase,
                            onRetry = { caseStore.load(force = true) },
                        )
                    }
                    composable<BriefingRoute> {
                        BriefingScreen(
                            case = session.case,
                            caseIndex = caseIndex(session.case),
                            onStart = {
                                // Screenshot mode opens on a written session instead of an empty one.
                                session.case?.let { case -> shot?.seed?.invoke(case.id, apiLocale) }
                                    ?.let { session.seed(it.messages, it.elapsed) }
                                if (shot == null) scope.launch { settings.setPracticeInProgress(true) }
                                nav.navigate(PracticeRoute)
                            },
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
                            showRealInfoHint = !realInfoHintSeen && shot == null,
                            // Screenshot mode never saves; the end sheet must say so.
                            saveHistory = saveHistory && shot == null,
                            onLeave = {
                                // Nothing kept: coming back starts a fresh session (timer, messages).
                                session.finish()
                                scope.launch { settings.setPracticeInProgress(false) }
                                nav.popBackStack()
                            },
                            onSessionLost = sessionLost,
                            onEnd = { nav.navigate(SupervisionRoute) { popUpTo(BriefingRoute) { inclusive = true } } },
                            onHelp = openHelp,
                            onOtherCase = {
                                // Leaving the session for another case: no practice left open.
                                scope.launch { settings.setPracticeInProgress(false) }
                                nav.navigate(CasesRoute) { popUpTo(HomeRoute) }
                            },
                        )
                    }
                    composable<SupervisionRoute> {
                        val vm = viewModel { SupervisionViewModel(component.api, session, history.takeIf { saveHistory && shot == null }) }
                        SupervisionScreen(
                            viewModel = vm,
                            demoData = demoBadge,
                            onShown = {
                                scope.launch {
                                    settings.setPracticeInProgress(false)
                                    if (shot == null) settings.markRealInfoHintSeen()
                                }
                            },
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
                        )
                    }
                    composable<HelpRoute> { HelpScreen(onClose = { nav.popBackStack() }) }
                    composable<PrivacyRoute> { PrivacyScreen(onBack = { nav.popBackStack() }) }
                    composable<MeRoute> { meScreen() }
                }
                }
                // The server refused the session: sign in again, then come back here (login.md
                // "其他错误"). The page keeps what it had; a running practice isn't lost.
                LaunchedEffect(expired) {
                    if (!expired || shot != null) return@LaunchedEffect
                    sessions.consumeExpired()
                    val onLogin = nav.currentBackStackEntry?.destination?.hasRoute<LoginRoute>() == true
                    if (!onLogin) nav.navigate(LoginRoute(notice = LoginRoute.NOTICE_EXPIRED, returnBack = true)) { launchSingleTop = true }
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
