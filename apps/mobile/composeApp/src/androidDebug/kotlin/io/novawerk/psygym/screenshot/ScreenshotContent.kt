package io.novawerk.psygym.screenshot

import io.novawerk.psygym.data.api.ChatEvent
import io.novawerk.psygym.data.api.PsygymApi
import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.Difficulty
import io.novawerk.psygym.domain.model.LocalizedText
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import io.novawerk.psygym.domain.screenshot.SessionSeed
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

/**
 * Written content for store screenshots. Debug variant only: this file is not compiled
 * into release builds.
 *
 * The cases use the public fields of the pseudonym cases in content/cases (without the
 * "placeholder" wording). The session is a calm first session within docs/safety.md: no
 * self-harm details, no diagnosis from the client. Every quote in the report is copied
 * word for word from the counselor's lines (acceptance C2) and the report ends with the
 * AI line (C7).
 */
internal object ScreenshotContent {

    const val LIN = "store-lin"
    const val JIE = "store-jie"

    val cases = listOf(
        CaseSummary(
            id = LIN,
            school = "cbt",
            title = LocalizedText(zh = "毕业后的低落", en = "Low after graduation"),
            summary = LocalizedText(
                zh = "23 岁，毕业半年还没找到工作，最近什么都不想做。",
                en = "23, still looking for work six months after graduating, and nothing feels worth doing.",
            ),
            tags = listOf(LocalizedText(zh = "抑郁", en = "Depression"), LocalizedText(zh = "求职压力", en = "Job search")),
            difficulty = Difficulty.Intro,
            estimatedMinutes = 15,
            clientAlias = LocalizedText(zh = "小林", en = "Lin"),
            clientIntro = LocalizedText(
                zh = "小林，23 岁，去年毕业，正在找工作。自己预约的第一次咨询。",
                en = "Lin, 23, graduated last year and is looking for work. Booked this first session herself.",
            ),
            practiceFocus = listOf(
                LocalizedText(zh = "建立关系", en = "Building rapport"),
                LocalizedText(zh = "识别自动思维", en = "Spotting automatic thoughts"),
            ),
        ),
        CaseSummary(
            id = JIE,
            school = "cbt",
            title = LocalizedText(zh = "项目上线前的失眠", en = "Sleepless before launch"),
            summary = LocalizedText(
                zh = "31 岁程序员，工作压力大，睡不着、心慌，对什么都提不起兴趣。",
                en = "A 31-year-old developer under pressure at work: can't sleep, heart racing, nothing feels interesting.",
            ),
            tags = listOf(
                LocalizedText(zh = "抑郁", en = "Depression"),
                LocalizedText(zh = "焦虑", en = "Anxiety"),
                LocalizedText(zh = "工作压力", en = "Work stress"),
            ),
            difficulty = Difficulty.Medium,
            estimatedMinutes = 20,
            clientAlias = LocalizedText(zh = "阿杰", en = "Jie"),
            clientIntro = LocalizedText(
                zh = "阿杰，31 岁，程序员，组里的小组长。妻子劝他来的。",
                en = "Jie, 31, a developer who leads a small team. His wife talked him into coming.",
            ),
            practiceFocus = listOf(
                LocalizedText(zh = "情绪识别", en = "Naming feelings"),
                LocalizedText(zh = "认知概念化", en = "Case conceptualisation"),
            ),
        ),
    )

    // --- 小林 / Lin: a first session, five turns ---

    private val LIN_ZH = listOf(
        Message(Role.Counselor, "你好，我是今天和你聊的咨询师。是什么让你想来这里聊聊？"),
        Message(Role.Client, "就……最近什么都不想做。早上起不来，觉得自己挺没用的。"),
        Message(Role.Counselor, "听起来这段时间你过得挺累的。这种“什么都不想做”的感觉，大概是从什么时候开始的？"),
        Message(Role.Client, "差不多四个月吧。第二次面试没过之后，就更明显了。"),
        Message(Role.Counselor, "第二次面试没过的那天，你心里冒出来的第一个念头是什么？"),
        Message(Role.Client, "“我又搞砸了。”……别人好像都找到工作了，只有我还在原地。"),
        Message(Role.Counselor, "“我又搞砸了”这个念头出现的时候，你有多相信它？如果 0 到 100 分的话。"),
        Message(Role.Client, "九十吧……其实也知道面试没过的人很多，可就是觉得是我不行。"),
        Message(Role.Counselor, "你一边知道很多人都没过，一边又觉得是自己不行。我们可以一起看看，支持和不支持这个想法的证据分别有哪些，你愿意试试吗？"),
        Message(Role.Client, "……好，可以试试。"),
    )

    private val LIN_EN = listOf(
        Message(Role.Counselor, "Hi, I'm the counselor you'll be talking with today. What brings you here?"),
        Message(Role.Client, "Um… I just don't feel like doing anything lately. I can't get up in the mornings. I feel kind of useless."),
        Message(Role.Counselor, "It sounds like these past months have been exhausting. When did this feeling of not wanting to do anything start?"),
        Message(Role.Client, "About four months ago. It got worse after my second interview didn't work out."),
        Message(Role.Counselor, "On the day you heard about that interview, what was the first thought that went through your mind?"),
        Message(Role.Client, "'I've messed up again.' …Everyone else seems to have found a job. I'm the only one still stuck."),
        Message(Role.Counselor, "When the thought 'I've messed up again' shows up, how much do you believe it, from 0 to 100?"),
        Message(Role.Client, "Ninety, maybe… I know lots of people don't get through interviews. But it still feels like it's me."),
        Message(Role.Counselor, "Part of you knows many people don't get through, and part of you says it's you. Shall we look at the evidence for and against that thought together?"),
        Message(Role.Client, "…Okay. I can try."),
    )

    private val LIN_REPORT_ZH = """
        ## 做得好的地方

        - 你说「听起来这段时间你过得挺累的。」先回应来访者的感受，再问时间线，有助于建立关系。
        - 你说「“我又搞砸了”这个念头出现的时候，你有多相信它？如果 0 到 100 分的话。」把自动思维说具体，并请来访者打分，是识别自动思维的扎实做法。

        ## 需要改进的地方

        - 你说「第二次面试没过的那天，你心里冒出来的第一个念头是什么？」时机合适，但在这之前还没有和来访者一起设定这次会谈的议程。可以换成：「在我们深入之前，今天你最希望我们一起聊些什么？」
        - 你说「我们可以一起看看，支持和不支持这个想法的证据分别有哪些，你愿意试试吗？」时，紧接在反映之后，一轮里放了两件事，来访者的回应变短了。可以换成先停在反映上：「这两种想法放在一起，是什么感觉？」

        ## 下次练什么

        1. 会谈开始时，先和来访者共同设定议程。
        2. 提出练习之前，多停留一轮反映感受，确认来访者跟上了。
        3. 用苏格拉底式提问，检验一个自动思维的证据。

        这份反馈由 AI 生成，仅供练习参考。
    """.trimIndent()

    private val LIN_REPORT_EN = """
        ## What went well

        - You said "It sounds like these past months have been exhausting." You met her feelings first, then asked about the timeline, which builds rapport.
        - You said "When the thought 'I've messed up again' shows up, how much do you believe it, from 0 to 100?" Pinning the automatic thought down and asking for a rating is a solid way to spot automatic thoughts.

        ## What to improve

        - You said "On the day you heard about that interview, what was the first thought that went through your mind?" Good timing, but you hadn't set an agenda for the session together yet. Try instead: "Before we go deeper, what would you most like us to talk about today?"
        - You said "Shall we look at the evidence for and against that thought together?" straight after a reflection, two things in one turn, and her answer got shorter. Try instead staying with the reflection first: "What is it like to hold both of those thoughts?"

        ## What to practise next

        1. Set an agenda together at the start of the session.
        2. Stay with a reflection for one more turn before suggesting an exercise.
        3. Use Socratic questions to test the evidence for one automatic thought.

        This feedback is AI-generated, for practice only.
    """.trimIndent()

    fun seed(caseId: String, locale: ApiLocale): SessionSeed? = when (caseId) {
        LIN -> SessionSeed(
            messages = if (locale == ApiLocale.Zh) LIN_ZH else LIN_EN,
            elapsed = 12.minutes + 40.seconds,
        )
        else -> null
    }

    fun report(caseId: String, locale: ApiLocale): String? = when (caseId) {
        LIN -> if (locale == ApiLocale.Zh) LIN_REPORT_ZH else LIN_REPORT_EN
        else -> null
    }
}

/** Serves [ScreenshotContent]. Answers at once: screenshots don't need streaming. */
internal class ScreenshotApi : PsygymApi {
    override suspend fun cases(): List<CaseSummary> = ScreenshotContent.cases

    override fun chat(request: TurnRequest): Flow<ChatEvent> = flowOf(
        ChatEvent.Delta(if (request.locale == ApiLocale.Zh) "嗯……我想想。" else "Hmm… let me think."),
    )

    override fun supervision(request: TurnRequest): Flow<String> =
        flowOf(ScreenshotContent.report(request.caseId, request.locale) ?: "")
}
