package io.novawerk.psygym.screenshot

import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.Role
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** The store screenshots must hold up to a reader: quotes word for word, all three parts. */
class ScreenshotContentTest {

    private fun check(locale: ApiLocale, said: String, quote: Regex, headings: List<String>, closing: String) {
        val seed = assertNotNull(ScreenshotContent.seed(ScreenshotContent.LIN, locale))
        val report = assertNotNull(ScreenshotContent.report(ScreenshotContent.LIN, locale))
        val counselor = seed.messages.filter { it.role == Role.Counselor }.joinToString("\n") { it.text }

        assertEquals(5, seed.messages.count { it.role == Role.Counselor })
        val quotes = report.lines().filter { it.contains(said) }.mapNotNull { line ->
            quote.find(line.substringAfter(said))?.groupValues?.get(1)
        }
        assertEquals(4, quotes.size, "every item quotes the counselor")
        quotes.forEach { assertTrue(counselor.contains(it), "not word for word: $it") }
        headings.forEach { assertTrue(report.contains("## $it"), "missing section: $it") }
        assertEquals(closing, report.lines().last { it.isNotBlank() })
    }

    @Test
    fun chinese() = check(
        ApiLocale.Zh,
        said = "你说「",
        quote = Regex("^(.*?)」"),
        headings = listOf("做得好的地方", "需要改进的地方", "下次练什么"),
        closing = "这份反馈由 AI 生成，仅供练习参考。",
    )

    @Test
    fun english() = check(
        ApiLocale.En,
        said = "You said \"",
        quote = Regex("^(.*?)\"(?: |$)"),
        headings = listOf("What went well", "What to improve", "What to practise next"),
        closing = "This feedback is AI-generated, for practice only.",
    )
}
