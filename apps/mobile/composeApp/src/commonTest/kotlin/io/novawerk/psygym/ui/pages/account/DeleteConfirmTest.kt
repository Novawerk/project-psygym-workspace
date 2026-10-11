package io.novawerk.psygym.ui.pages.account

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DeleteConfirmTest {
    @Test
    fun theFirstThreeCharactersUnlockDelete() {
        assertTrue(deleteConfirmMatches("lin@example.com", "lin"))
        assertTrue(deleteConfirmMatches("Lin@example.com", " LIN "))
        assertFalse(deleteConfirmMatches("lin@example.com", "li"))
        assertFalse(deleteConfirmMatches("lin@example.com", "linx"))
        assertFalse(deleteConfirmMatches("", ""))
    }
}
