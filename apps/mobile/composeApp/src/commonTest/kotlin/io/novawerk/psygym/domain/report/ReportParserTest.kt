package io.novawerk.psygym.domain.report

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ReportParserTest {
    private val zh = """
        ## 做得好的地方

        - 你说「听起来这段时间你很累。」，好在先回应了感受。

        ## 需要改进的地方

        - 来访者说起来没意义时，没有问安全。来访者说：「觉得起来也没什么意义」。可以换成：你有没有想过伤害自己，或者不想活了？
        - 过早给建议。来访者说：「我也试过早睡」。你说：「你可以试试每天早点睡」。可以换成：早睡这件事，你试的时候发生了什么？
        - 问题太多。你说：「那你睡得怎么样？吃得怎么样？」。可以换成：这几天里，哪件事最让你难受？

        ## 下次练什么

        - 会谈开始时，先共同设定议程。
        - 用苏格拉底式提问，检验一个自动思维。

        这份反馈由 AI 生成，仅供练习参考。
    """.trimIndent()

    private val en = """
        ## What went well

        - You said “What brings you here today?”, which gave the client room to start.

        ## What to improve

        - You moved to advice too fast. You said: “You should try to sleep earlier”. Try instead: What happens when you try to sleep earlier?

        ## What to practise next

        - Set an agenda together at the start.

        This feedback is AI-generated, for practice only.
    """.trimIndent()

    private fun ParsedReport.items(section: ReportSection) = parts.first { it.section == section }.items

    @Test
    fun chinese() {
        val r = ReportParser.parse(zh)!!
        assertEquals(listOf("做得好的地方", "需要改进的地方", "下次练什么"), r.parts.map { it.title })
        val good = assertIs<ReportItem.Parsed>(r.items(ReportSection.Good).single())
        assertEquals(listOf(Quote(Speaker.Counselor, "听起来这段时间你很累。")), good.quotes)
        assertEquals("好在先回应了感受。", good.note)
        val third = assertIs<ReportItem.Parsed>(r.items(ReportSection.Improve)[2])
        assertEquals("问题太多。", third.note)
        assertEquals("这几天里，哪件事最让你难受？", third.tryInstead)
        assertEquals(listOf("会谈开始时，先共同设定议程。", "用苏格拉底式提问，检验一个自动思维。"), r.items(ReportSection.Next).map { (it as ReportItem.Parsed).note })
        assertEquals("这份反馈由 AI 生成，仅供练习参考。", r.footer)
    }

    @Test
    fun english() {
        val r = ReportParser.parse(en)!!
        val good = assertIs<ReportItem.Parsed>(r.items(ReportSection.Good).single())
        assertEquals("What brings you here today?", good.quotes.single().text)
        assertEquals("Which gave the client room to start.", good.note)
        val improve = assertIs<ReportItem.Parsed>(r.items(ReportSection.Improve).single())
        assertEquals("You moved to advice too fast.", improve.note)
        assertEquals(Quote(Speaker.Counselor, "You should try to sleep earlier"), improve.quotes.single())
        assertEquals("What happens when you try to sleep earlier?", improve.tryInstead)
        assertTrue(!improve.risk)
        assertEquals("This feedback is AI-generated, for practice only.", r.footer)
    }

    @Test
    fun twoQuotesInOneItemKeepTheirOrderAndSpeakers() {
        val second = assertIs<ReportItem.Parsed>(ReportParser.parse(zh)!!.items(ReportSection.Improve)[1])
        assertEquals(listOf(Quote(Speaker.Client, "我也试过早睡"), Quote(Speaker.Counselor, "你可以试试每天早点睡")), second.quotes)
        assertEquals("过早给建议。", second.note)
        // Quoting the client for context doesn't make it the risk item.
        assertTrue(!second.risk)
    }

    @Test
    fun riskItemIsTheFirstImproveItemQuotingOnlyTheClient() {
        val improve = ReportParser.parse(zh)!!.items(ReportSection.Improve).map { it as ReportItem.Parsed }
        assertEquals(listOf(true, false, false), improve.map { it.risk })
        assertEquals("来访者说起来没意义时，没有问安全。", improve[0].note)
        assertEquals("你有没有想过伤害自己，或者不想活了？", improve[0].tryInstead)
        // The English form is read the same way.
        val enRisk = en.replace(
            "- You moved to advice too fast. You said: “You should try to sleep earlier”.",
            "- You didn't ask about safety. The client said: “There's no point getting up”.",
        )
        assertTrue((ReportParser.parse(enRisk)!!.items(ReportSection.Improve).single() as ReportItem.Parsed).risk)
    }

    @Test
    fun aReportWithoutTheHeadingsIsNotParsed() {
        assertNull(ReportParser.parse("Just some text.\n\n- a list"))
        // Headings out of order: plain Markdown, as before.
        assertNull(ReportParser.parse("## 下次练什么\n\n- x\n\n## 做得好的地方\n\n- y"))
    }

    @Test
    fun anItemWeCantReadIsKeptAsPlainText() {
        val odd = zh.replace("- 问题太多。你说：「那你睡得怎么样？吃得怎么样？」。可以换成：这几天里，哪件事最让你难受？", "- **问题太多**，下次少问一点。")
            .replace("## 需要改进的地方\n", "## 需要改进的地方\n\n一段没有列表符号的话。\n")
        val improve = ReportParser.parse(odd)!!.items(ReportSection.Improve)
        assertEquals(ReportItem.Plain("一段没有列表符号的话。"), improve.first())
        assertEquals(ReportItem.Plain("**问题太多**，下次少问一点。"), improve.last())
        // Nothing is lost: every non-blank line of the report is somewhere in the result.
        val r = ReportParser.parse(odd)!!
        val kept = r.parts.flatMap { p -> listOf(p.title) + p.items.map { it.raw } } + r.footer
        odd.lines().filter { it.isNotBlank() }.forEach { line ->
            assertTrue(kept.any { line.removePrefix("## ").removePrefix("- ").trim() == it }, "lost: $line")
        }
    }

    @Test
    fun aReportStillStreamingParsesWhatHasArrived() {
        val cut = zh.substring(0, zh.indexOf("可以换成：你有没有") + "可以换成：".length)
        val r = ReportParser.parse(cut)!!
        assertEquals(listOf(ReportSection.Good, ReportSection.Improve), r.parts.map { it.section })
        // The cut-off item has no suggestion yet: plain for now, never dropped.
        assertIs<ReportItem.Plain>(r.items(ReportSection.Improve).single())
    }
}
