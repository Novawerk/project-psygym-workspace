package io.novawerk.psygym.domain.report

// Reads a supervision report in the backend's format (apps/api/prompts/supervisor.md,
// docs/product/screens.md R1 "按这个格式解析") so the app can show it as cards.
//
// The report is Markdown with three fixed headings. Each item is one "- " line:
//   做得好:   - 你说「原话」，好在……。            / - You said “…”, which …
//   需要改进: - 问题。你说：「原话」。可以换成：…  / - Problem. You said: “…”. Try instead: …
//   下次练什么: - 一个技术或动作。
// An item may quote the client too (来访者说：「…」 / The client said: “…”).
//
// Nothing here may lose text: an item we can't read keeps its raw text and is shown as
// plain Markdown, and a report without the three headings isn't parsed at all.

enum class ReportSection { Good, Improve, Next }

enum class Speaker { Counselor, Client }

data class Quote(val speaker: Speaker, val text: String)

sealed interface ReportItem {
    /** The original Markdown of the item, without the leading "- ". */
    val raw: String

    /** Read into parts: the note (the problem, or why it was good), quotes, a suggested line. */
    data class Parsed(
        override val raw: String,
        val note: String,
        val quotes: List<Quote>,
        val tryInstead: String?,
        /** The risk-screening item: gets a shield (screens.md R1 item 6). */
        val risk: Boolean = false,
    ) : ReportItem

    /** Couldn't be read: shown as plain Markdown. */
    data class Plain(override val raw: String) : ReportItem
}

data class ReportPart(val section: ReportSection, val title: String, val items: List<ReportItem>)

data class ParsedReport(
    /** Anything before the first heading (normally empty). */
    val intro: String,
    val parts: List<ReportPart>,
    /** Lines after the last list: the AI line ("这份反馈由 AI 生成……"). */
    val footer: String,
)

object ReportParser {
    private val headings = mapOf(
        "做得好的地方" to ReportSection.Good,
        "需要改进的地方" to ReportSection.Improve,
        "下次练什么" to ReportSection.Next,
        "What went well" to ReportSection.Good,
        "What to improve" to ReportSection.Improve,
        "What to practise next" to ReportSection.Next,
        "What to practice next" to ReportSection.Next,
    )

    // 你说「…」 / 来访者说：「…」 / You said “…” / The client said: “…” (straight quotes too).
    private val quoteZh = Regex("""(来访者说|你说)[：:]?\s*「([^」]+)」[，,。.；;]?\s*""")
    private val quoteEn = Regex("""(?i)(the client said|you said)[：:,]?\s*[“"]([^”"]+)[”"][,.;]?\s*""")
    private val tryZh = Regex("""可以换成[：:]\s*""")
    private val tryEn = Regex("""Try instead[：:]\s*""")
    private val listItem = Regex("""^\s*(?:[-*•]|\d+[.)、])\s+""")

    /**
     * The report as cards, or null when it isn't in the card format (no three headings in
     * order): then the app shows it as plain Markdown, as before. Works on a report that is
     * still streaming: a cut-off last item just doesn't parse yet.
     */
    fun parse(report: String): ParsedReport? {
        val lines = report.lines()
        val starts = lines.mapIndexedNotNull { i, line ->
            val title = line.trim().takeIf { it.startsWith("## ") }?.removePrefix("## ")?.trim() ?: return@mapIndexedNotNull null
            headings[title]?.let { Triple(i, it, title) }
        }
        if (starts.map { it.second } != ReportSection.entries.toList()) {
            // While streaming, the later headings haven't arrived yet: parse what we have, as
            // long as it starts the right way.
            val prefix = ReportSection.entries.take(starts.size)
            if (starts.isEmpty() || starts.map { it.second } != prefix) return null
        }
        val intro = lines.take(starts.first().first).joinToString("\n").trim()
        var footer = ""
        val parts = starts.mapIndexed { n, (start, section, title) ->
            val end = starts.getOrNull(n + 1)?.first ?: lines.size
            val body = lines.subList(start + 1, end)
            val items = mutableListOf<ReportItem>()
            val rest = mutableListOf<String>()
            body.forEach { line ->
                when {
                    line.isBlank() -> if (rest.isNotEmpty()) rest += line
                    listItem.containsMatchIn(line) && rest.isEmpty() -> items += readItem(section, listItem.replaceFirst(line, "").trim())
                    // A plain line inside a section: keep it, as a plain item (or the footer
                    // after the last section).
                    n < starts.lastIndex -> items += ReportItem.Plain(line.trim())
                    else -> rest += line
                }
            }
            if (n == starts.lastIndex) footer = rest.joinToString("\n").trim()
            ReportPart(section, title, items.markRisk(section))
        }
        return ParsedReport(intro, parts, footer)
    }

    private fun readItem(section: ReportSection, raw: String): ReportItem {
        if (section == ReportSection.Next) return ReportItem.Parsed(raw, note = raw, quotes = emptyList(), tryInstead = null)
        var text = raw
        // "可以换成：" takes everything after it (it's always last).
        val tryMatch = tryZh.find(text) ?: tryEn.find(text)
        val tryInstead = tryMatch?.let { text.substring(it.range.last + 1).trim().ifEmpty { null } }
        if (tryMatch != null) text = text.substring(0, tryMatch.range.first)
        val quotes = mutableListOf<Quote>()
        val matches = (quoteZh.findAll(text) + quoteEn.findAll(text)).sortedBy { it.range.first }.toList()
        matches.forEach { m ->
            val speaker = if (m.groupValues[1].startsWith("你") || m.groupValues[1].equals("you said", ignoreCase = true)) Speaker.Counselor else Speaker.Client
            quotes += Quote(speaker, m.groupValues[2].trim())
        }
        if (quotes.isEmpty() && tryInstead == null) return ReportItem.Plain(raw)
        // A "try instead" with nothing after it is a cut-off item (still streaming): plain.
        if (tryMatch != null && tryInstead == null) return ReportItem.Plain(raw)
        var note = text
        matches.sortedByDescending { it.range.first }.forEach { note = note.removeRange(it.range) }
        note = note.trim().trimStart('，', ',', '：', ':', '；', ';', ' ').trim()
        if (note.isNotEmpty() && note.first().isLowerCase()) note = note.replaceFirstChar { it.uppercase() }
        return ReportItem.Parsed(raw, note, quotes, tryInstead)
    }

    // No skill tags yet: the risk item is the first "to improve" item, quoting only the client
    // (screens.md R1 item 6). Other items may quote the client too, so that alone isn't enough.
    private fun List<ReportItem>.markRisk(section: ReportSection): List<ReportItem> {
        if (section != ReportSection.Improve) return this
        val first = firstOrNull() as? ReportItem.Parsed ?: return this
        val onlyClient = first.quotes.isNotEmpty() && first.quotes.all { it.speaker == Speaker.Client }
        return if (onlyClient) listOf(first.copy(risk = true)) + drop(1) else this
    }
}
