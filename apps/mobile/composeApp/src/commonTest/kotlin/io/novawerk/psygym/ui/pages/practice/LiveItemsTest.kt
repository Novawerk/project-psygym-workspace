package io.novawerk.psygym.ui.pages.practice

import io.novawerk.psygym.data.api.FakePsygymApi
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LiveItemsTest {
    @Test
    fun itemsAndTheRiskReminder() {
        val items = liveItems(
            """
            - 来访者说「觉得起来也没什么意义」，可以找机会问一下安全。可以换成：你还好吗？
            - 你说「听起来很累」，好在接住了情绪。
              这一行接在上一条后面。
            - 接下来可以问问睡眠。可以换成：最近睡得怎么样？
            """.trimIndent(),
        )
        assertEquals(listOf(true, false, false), items.map { it.risk })
        assertTrue(items[1].text.endsWith("这一行接在上一条后面。"))
        // Quotes stay as written.
        assertTrue(items[0].text.contains("「觉得起来也没什么意义」"))
    }

    @Test
    fun plainTextIsKept() {
        assertEquals(listOf("Some text without a list."), liveItems("Some text without a list.").map { it.text })
    }

    @Test
    fun demoLiveNotesFollowTheLiveFormat() = runTest {
        for (locale in ApiLocale.entries) {
            val request = TurnRequest(
                "demo-depression",
                locale,
                listOf(Message(Role.Counselor, "Hi there."), Message(Role.Client, "Nothing feels worth it.")),
                mode = "live",
            )
            val text = FakePsygymApi(charDelayMillis = 0).supervision(request).toList().joinToString("")
            assertTrue("##" !in text, "$locale: no headings")
            val items = liveItems(text)
            assertTrue(items.size in 1..3, "$locale: 1–3 items")
            assertTrue(items.first().risk, "$locale: the risk reminder first")
            assertTrue("AI" !in text.lines().last(), "$locale: no AI line (the app writes it)")
            assertTrue(text.contains("Nothing feels worth it."), "$locale: quotes word for word")
        }
    }

    @Test
    fun onlyTheFirstItemCanBeTheRiskReminder() {
        val items = liveItems("- 你说「好」，好在开放。\n- 来访者说「累」，可以多问问。可以换成：怎么累？")
        assertEquals(listOf(false, false), items.map { it.risk })
    }

    @Test
    fun yourWordsInASuggestedLineDontHideTheShield() {
        // "你说的这些" here is the suggested line, not a quote of the counselor.
        val zh = liveItems("- 来访者说「觉得没意义」，可以找机会问一下安全。可以换成：你说的这些让我有点担心，你有没有想过伤害自己？")
        assertTrue(zh.single().risk)
        val en = liveItems("- The client said “It feels pointless”; find a moment to ask about safety. Try instead: What you said worries me a little.")
        assertTrue(en.single().risk)
        // A real quote of the counselor does.
        assertEquals(false, liveItems("- 来访者说「累」。你说「早点睡」，太快给建议了。").single().risk)
    }
}
