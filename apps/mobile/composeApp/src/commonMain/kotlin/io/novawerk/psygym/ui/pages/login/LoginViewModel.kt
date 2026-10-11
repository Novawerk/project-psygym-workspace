package io.novawerk.psygym.ui.pages.login

import androidx.lifecycle.ViewModel
import io.novawerk.psygym.domain.auth.LoginFlow

/** Keeps the sign-in state for the login page's lifetime: switching 中/EN rebuilds the screens, not this. */
class LoginViewModel(val flow: LoginFlow) : ViewModel()
