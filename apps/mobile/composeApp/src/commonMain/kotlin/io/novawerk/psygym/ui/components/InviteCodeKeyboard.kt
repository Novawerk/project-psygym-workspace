package io.novawerk.psygym.ui.components

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType

/**
 * For invite codes: no autocorrect, no capitals, no suggestions. A Password keyboard type
 * (shown as plain text: no visual transformation) is what keeps Gboard from turning
 * "testcode1" into "test code1".
 */
val InviteCodeKeyboard = KeyboardOptions(
    capitalization = KeyboardCapitalization.None,
    autoCorrectEnabled = false,
    keyboardType = KeyboardType.Password,
    imeAction = ImeAction.Done,
)
