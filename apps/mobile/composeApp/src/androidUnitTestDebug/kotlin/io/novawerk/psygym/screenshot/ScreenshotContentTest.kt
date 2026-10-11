package io.novawerk.psygym.screenshot

import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.report.ReportItem
import io.novawerk.psygym.domain.report.ReportParser
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** The store screenshots must hold up to a reader: quotes word for word, all three parts. */
class ScreenshotContentTest {

    private fun check(locale: ApiLocale, quote: Regex, headings: List<String>, closing: String) {
        val seed = assertNotNull(ScreenshotContent.seed(ScreenshotContent.LIN, locale))
        val report = assertNotNull(ScreenshotContent.report(ScreenshotContent.LIN, locale))
        val counselor = seed.messages.filter { it.role == Role.Counselor }.joinToString("\n") { it.text }

        assertEquals(5, seed.messages.count { it.role == Role.Counselor })
        val quotes = quote.findAll(report).map { it.groupValues[1] }.toList()
        assertEquals(3, quotes.size, "every item but the practice ones quotes the counselor")
        quotes.forEach { assertTrue(counselor.contains(it), "not word for word: $it") }
        headings.forEach { assertTrue(report.contains("## $it"), "missing section: $it") }
        assertEquals(closing, report.lines().last { it.isNotBlank() })
        // Shows as cards: every item reads, and no item is mistaken for the risk item.
        val parsed = assertNotNull(ReportParser.parse(report))
        val items = parsed.parts.flatMap { it.items }
        assertTrue(items.none { it is ReportItem.Plain }, "an item doesn't read: ${items.filterIsInstance<ReportItem.Plain>()}")
        assertTrue(items.none { (it as ReportItem.Parsed).risk })
        // House rule: the report says "the client", never he/she.
        val pronoun = Regex("\\b(he|she|her|him|his)\\b|他|她", RegexOption.IGNORE_CASE)
        assertTrue(pronoun.find(report) == null, "pronoun in report: ${pronoun.find(report)?.value}")
    }

    @Test
    fun chinese() = check(
        ApiLocale.Zh,
        quote = Regex("「(.*?)」"),
        headings = listOf("做得好的地方", "需要改进的地方", "下次练什么"),
        closing = "这份反馈由 AI 生成，仅供练习参考。",
    )

    @Test
    fun english() = check(
        ApiLocale.En,
        quote = Regex("“(.*?)”"),
        headings = listOf("What went well", "What to improve", "What to practise next"),
        closing = "This feedback is AI-generated, for practice only.",
    )
}
