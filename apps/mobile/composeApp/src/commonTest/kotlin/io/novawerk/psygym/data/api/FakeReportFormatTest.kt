package io.novawerk.psygym.data.api

import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The demo report follows the real report's format (backend #57, product #58). */
class FakeReportFormatTest {
    private val long = "Hi, what brings you here today? Take your time, there's no rush at all."
    private val request = { locale: ApiLocale ->
        TurnRequest("demo-depression", locale, listOf(Message(Role.Counselor, long), Message(Role.Client, "嗯"), Message(Role.Counselor, "最近睡得怎么样？")))
    }

    private suspend fun report(locale: ApiLocale) = FakePsygymApi(charDelayMillis = 0).supervision(request(locale)).toList().joinToString("")

    private fun itemsUnder(report: String, heading: String): List<String> =
        report.substringAfter("## $heading").substringBefore("\n## ").lines().filter { it.startsWith("- ") }

    @Test
    fun chinese() = runTest {
        val r = report(ApiLocale.Zh)
        assertEquals(listOf(2, 3, 2), listOf("做得好的地方", "需要改进的地方", "下次练什么").map { itemsUnder(r, it).size })
        assertTrue(r.contains("「$long」"), "quotes the whole message, not a cut")
        assertTrue(r.contains("「最近睡得怎么样？」"))
        // Suggestions are not put in quote marks.
        assertTrue(Regex("可以换成：「").find(r) == null)
        assertTrue(r.trimEnd().endsWith("这份反馈由 AI 生成，仅供练习参考。"))
    }

    @Test
    fun english() = runTest {
        val r = report(ApiLocale.En)
        assertEquals(listOf(2, 3, 2), listOf("What went well", "What to improve", "What to practise next").map { itemsUnder(r, it).size })
        assertTrue(r.contains("\"$long\""))
        assertTrue(Regex("Try instead: [\"“]").find(r) == null)
        assertTrue(r.trimEnd().endsWith("This feedback is AI-generated, for practice only."))
    }
}
