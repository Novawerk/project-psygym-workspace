package io.novawerk.psygym.ui.pages.login

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.novawerk.psygym.domain.auth.LoginError
import io.novawerk.psygym.domain.auth.LoginFlow
import io.novawerk.psygym.domain.settings.AppLanguage
import io.novawerk.psygym.resources.Res
import io.novawerk.psygym.resources.back
import io.novawerk.psygym.resources.error_network
import io.novawerk.psygym.resources.error_unknown
import io.novawerk.psygym.resources.login_code_change_email
import io.novawerk.psygym.resources.login_code_field_cd
import io.novawerk.psygym.resources.login_code_invalid
import io.novawerk.psygym.resources.login_code_not_received
import io.novawerk.psygym.resources.login_code_resend
import io.novawerk.psygym.resources.login_code_resend_in
import io.novawerk.psygym.resources.login_code_resent
import io.novawerk.psygym.resources.login_code_sent_to
import io.novawerk.psygym.resources.login_code_submit
import io.novawerk.psygym.resources.login_code_title
import io.novawerk.psygym.resources.login_code_used_up
import io.novawerk.psygym.resources.login_email_hint
import io.novawerk.psygym.resources.login_email_invalid
import io.novawerk.psygym.resources.login_email_placeholder
import io.novawerk.psygym.resources.login_email_rate_limited
import io.novawerk.psygym.resources.login_email_send
import io.novawerk.psygym.resources.login_email_subtitle
import io.novawerk.psygym.resources.login_email_title
import io.novawerk.psygym.resources.login_invite_body
import io.novawerk.psygym.resources.login_invite_code_used_up
import io.novawerk.psygym.resources.login_invite_format
import io.novawerk.psygym.resources.login_invite_hint
import io.novawerk.psygym.resources.login_invite_invalid
import io.novawerk.psygym.resources.login_invite_label
import io.novawerk.psygym.resources.login_invite_none
import io.novawerk.psygym.resources.login_invite_submit
import io.novawerk.psygym.resources.login_invite_title
import io.novawerk.psygym.resources.login_privacy_link
import io.novawerk.psygym.resources.login_privacy_note
import io.novawerk.psygym.resources.settings_fake_api
import io.novawerk.psygym.ui.components.BottomActions
import io.novawerk.psygym.ui.components.InviteCodeKeyboard
import io.novawerk.psygym.ui.components.LanguageToggle
import io.novawerk.psygym.ui.components.PrimaryButton
import io.novawerk.psygym.ui.locale.rememberApiLocale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource

// L1–L3 (docs/product/login.md §2, design row ⑦). The state is in [LoginFlow]; these screens
// only show it. Inputs are kept on every error, offline included.

/** L1 · Email. [notice] is a line above the title: the move to sign-in, an expired session, a deleted account. */
@Composable
fun LoginEmailScreen(
    flow: LoginFlow,
    notice: String?,
    onBack: (() -> Unit)?,
    onLanguage: (AppLanguage) -> Unit,
    onPrivacy: () -> Unit,
    /** Debug builds only (AppConfig.demoSwitchOnSignIn): the demo data switch; null hides it. */
    demoData: Boolean? = null,
    onDemoData: (Boolean) -> Unit = {},
) {
    val locale = rememberApiLocale()
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val send = { scope.launch { flow.sendCode(locale) } }
    // The format message only once the address could be complete, as in the design.
    val showInvalid = flow.error == LoginError.InvalidEmail ||
        (flow.email.length > 3 && "@" in flow.email && !flow.emailLooksValid && flow.error == null)
    LoginPage(
        onBack = onBack,
        onLanguage = onLanguage,
        bottom = {
            PrimaryButton(stringResource(Res.string.login_email_send), { send() }, enabled = flow.emailLooksValid && !flow.busy)
            PrivacyNote(onPrivacy)
        },
    ) {
        notice?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
        }
        Title(stringResource(Res.string.login_email_title), stringResource(Res.string.login_email_subtitle))
        FieldLabel(stringResource(Res.string.login_email_hint))
        LoginField(
            value = flow.email,
            onValueChange = {
                flow.email = it
                flow.clearError()
            },
            placeholder = stringResource(Res.string.login_email_placeholder),
            isError = showInvalid || flow.error != null,
            keyboard = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send, autoCorrectEnabled = false),
            onDone = { if (flow.emailLooksValid) send() },
            modifier = Modifier.focusRequester(focus).semantics { contentType = ContentType.EmailAddress },
        )
        val message = if (showInvalid && flow.error == null) stringResource(Res.string.login_email_invalid) else flow.error?.let { errorText(it) }
        message?.let { ErrorLine(it) }
        if (demoData != null) {
            // A debug build may have no server with sign-in to talk to; the switch in Me is
            // behind sign-in. Release never shows this.
            Spacer(Modifier.height(24.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .toggleable(value = demoData, onValueChange = onDemoData, role = Role.Switch)
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(Res.string.settings_fake_api), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                Switch(checked = demoData, onCheckedChange = null)
            }
        }
    }
}

/** L2 · Code. Looks like six boxes; it's one field, read as "Code, 6 digits". */
@Composable
fun LoginCodeScreen(flow: LoginFlow, onChangeEmail: () -> Unit) {
    val locale = rememberApiLocale()
    val scope = rememberCoroutineScope()
    var code by rememberSaveable { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val submit = { scope.launch { flow.submitCode(code) } }
    // Ticks the "send again (45 s)" countdown.
    var wait by remember { mutableIntStateOf(flow.secondsUntilResend()) }
    LaunchedEffect(flow.tries, flow.resent, flow.error) {
        while (true) {
            wait = flow.secondsUntilResend()
            if (wait == 0) break
            delay(250)
        }
    }
    LoginPage(
        onBack = onChangeEmail,
        onLanguage = null,
        bottom = { PrimaryButton(stringResource(Res.string.login_code_submit), { submit() }, enabled = code.length == 6 && !flow.busy && !flow.codeUsedUp) },
    ) {
        Text(stringResource(Res.string.login_code_title), style = MaterialTheme.typography.headlineMedium.copy(fontSize = 28.sp), fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(
            buildAnnotatedString {
                val line = stringResource(Res.string.login_code_sent_to, "\u0000")
                append(line.substringBefore("\u0000"))
                pushStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface))
                append(flow.email.trim())
                pop()
                append(line.substringAfter("\u0000"))
            },
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Link(stringResource(Res.string.login_code_change_email), onChangeEmail)
        Spacer(Modifier.height(16.dp))
        CodeBoxes(
            code = code,
            onCode = { typed ->
                // Paste and autofill bring spaces or dashes; Chinese keyboards may give full-width
                // digits. A 7th digit on a full code changes nothing: no second submit.
                val digits = LoginFlow.codeDigits(typed).take(LoginFlow.CODE_LENGTH)
                if (digits != code) {
                    code = digits
                    flow.clearError()
                    if (digits.length == LoginFlow.CODE_LENGTH && !flow.codeUsedUp) scope.launch { flow.submitCode(digits) }
                }
            },
            isError = flow.error != null && flow.error !is LoginError.RateLimited,
            enabled = !flow.codeUsedUp,
            modifier = Modifier.focusRequester(focus),
        )
        when {
            flow.error != null -> ErrorLine(errorText(flow.error!!))
            flow.resent -> Text(
                stringResource(Res.string.login_code_resent),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 10.dp),
            )
        }
        Spacer(Modifier.height(24.dp))
        Text(stringResource(Res.string.login_code_not_received), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (wait > 0) {
            Text(
                stringResource(Res.string.login_code_resend_in, wait),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 12.dp),
            )
        } else {
            Link(
                stringResource(Res.string.login_code_resend),
                {
                    scope.launch {
                        flow.resend(locale)
                        // A new code is on its way: clear the old digits.
                        if (flow.resent) code = ""
                    }
                },
                bold = true,
            )
        }
    }
}

/** L3 · Invite code, new emails only. Sent with the same email code. */
@Composable
fun LoginInviteScreen(flow: LoginFlow, onBack: () -> Unit, onNoInvite: () -> Unit) {
    val scope = rememberCoroutineScope()
    var invite by rememberSaveable { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val submit = { scope.launch { flow.submitInvite(invite) } }
    LoginPage(
        onBack = onBack,
        onLanguage = null,
        bottom = {
            PrimaryButton(
                stringResource(Res.string.login_invite_submit),
                { submit() },
                enabled = LoginFlow.normalizeInvite(invite).isNotEmpty() && !flow.busy && !flow.codeUsedUp,
            )
            TextButton(onClick = onNoInvite) {
                Text(stringResource(Res.string.login_invite_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
    ) {
        Title(stringResource(Res.string.login_invite_title), stringResource(Res.string.login_invite_body))
        FieldLabel(stringResource(Res.string.login_invite_label))
        LoginField(
            value = invite,
            onValueChange = {
                invite = it
                flow.clearError()
            },
            placeholder = stringResource(Res.string.login_invite_hint),
            isError = flow.error != null,
            keyboard = InviteCodeKeyboard.copy(capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Done),
            onDone = { submit() },
            modifier = Modifier.focusRequester(focus),
        )
        Text(
            stringResource(Res.string.login_invite_format),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp, start = 2.dp),
        )
        flow.error?.let { ErrorLine(errorText(it)) }
    }
}

@Composable
private fun errorText(error: LoginError): String = when (error) {
    LoginError.InvalidEmail -> stringResource(Res.string.login_email_invalid)
    is LoginError.RateLimited -> stringResource(Res.string.login_email_rate_limited, error.seconds)
    LoginError.InvalidCode -> stringResource(Res.string.login_code_invalid)
    LoginError.CodeUsedUp -> stringResource(Res.string.login_code_used_up)
    LoginError.InviteInvalid -> stringResource(Res.string.login_invite_invalid)
    LoginError.InviteUsedUp -> stringResource(Res.string.login_invite_code_used_up)
    LoginError.Network -> stringResource(Res.string.error_network)
    LoginError.Storage, LoginError.Other -> stringResource(Res.string.error_unknown)
}

@Composable
private fun LoginPage(
    onBack: (() -> Unit)?,
    onLanguage: ((AppLanguage) -> Unit)?,
    bottom: @Composable ColumnScope.() -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Scaffold(
        topBar = {
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(start = 4.dp, end = 8.dp).height(56.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (onBack != null) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                    }
                }
                Spacer(Modifier.weight(1f))
                if (onLanguage != null) LanguageToggle(onChange = onLanguage)
            }
        },
        // Above the keyboard, so the button stays in reach while typing.
        bottomBar = { BottomActions(Modifier.imePadding(), content = bottom) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            content = content,
        )
    }
}

@Composable
private fun Title(title: String, subtitle: String) {
    Text(title, style = MaterialTheme.typography.headlineMedium.copy(fontSize = 28.sp), fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(8.dp))
    Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(28.dp))
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 8.dp))
}

@Composable
private fun LoginField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    isError: Boolean,
    keyboard: KeyboardOptions,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        isError = isError,
        placeholder = { Text(placeholder) },
        shape = RoundedCornerShape(8.dp),
        keyboardOptions = keyboard,
        keyboardActions = KeyboardActions(onAny = { onDone() }),
        colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = MaterialTheme.colorScheme.outline),
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun ErrorLine(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 10.dp, start = 2.dp))
}

@Composable
private fun Link(text: String, onClick: () -> Unit, bold: Boolean = false) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
        textDecoration = if (bold) null else TextDecoration.Underline,
        modifier = Modifier
            .padding(vertical = 4.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = 8.dp),
    )
}

/** "By signing in you agree to the privacy notice." with the notice as a link. */
@Composable
private fun PrivacyNote(onPrivacy: () -> Unit) {
    val link = stringResource(Res.string.login_privacy_link)
    val line = stringResource(Res.string.login_privacy_note, "\u0000")
    Text(
        buildAnnotatedString {
            append(line.substringBefore("\u0000"))
            withLink(
                LinkAnnotation.Clickable(
                    tag = "privacy",
                    styles = TextLinkStyles(SpanStyle(color = MaterialTheme.colorScheme.onSurface, textDecoration = TextDecoration.Underline)),
                ) { onPrivacy() },
            ) { append(link) }
            append(line.substringAfter("\u0000"))
        },
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

/** One digit field drawn as six boxes; the next empty box is outlined dark. */
@Composable
private fun CodeBoxes(code: String, onCode: (String) -> Unit, isError: Boolean, enabled: Boolean, modifier: Modifier = Modifier) {
    val label = stringResource(Res.string.login_code_field_cd)
    BasicTextField(
        value = code,
        onValueChange = onCode,
        enabled = enabled,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = label
                contentType = ContentType.SmsOtpCode
            },
        decorationBox = { innerTextField ->
            // The real text field must be laid out (invisibly) under the boxes: it carries the
            // cursor, the paste menu and the platform's one-time-code autofill.
            Box {
                Box(Modifier.matchParentSize().alpha(0f)) { innerTextField() }
            // Drawing only: screen readers read the one real field ("Code, 6 digits").
            Row(Modifier.clearAndSetSemantics {}, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(6) { i ->
                    val color = when {
                        isError -> MaterialTheme.colorScheme.error
                        i == code.length && enabled -> MaterialTheme.colorScheme.onSurface
                        else -> MaterialTheme.colorScheme.outline
                    }
                    Box(
                        Modifier.weight(1f).height(56.dp).border(1.dp, color, RoundedCornerShape(8.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(code.getOrNull(i)?.toString().orEmpty(), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            }
        },
    )
}
