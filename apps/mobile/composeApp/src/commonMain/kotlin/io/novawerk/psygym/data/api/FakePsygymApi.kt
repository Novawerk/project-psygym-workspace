package io.novawerk.psygym.data.api

import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.Difficulty
import io.novawerk.psygym.domain.model.LocalizedText
import io.novawerk.psygym.domain.model.Role
import io.novawerk.psygym.domain.model.TurnRequest
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Demo data so the whole flow works before `apps/api` is live.
 *
 * The text here is placeholder, not clinical content. Real cases live in `content/`
 * and are written by our psychologists.
 */
class FakePsygymApi(
    private val charDelayMillis: Long = 25,
) : PsygymApi {

    override suspend fun cases(): List<CaseSummary> {
        delay(400)
        return CASES
    }

    override fun chat(request: TurnRequest): Flow<ChatEvent> = flow {
        val zh = request.locale == ApiLocale.Zh
        // Like the mock backend: a counselor message containing #end makes the client leave.
        val ending = request.messages.lastOrNull()?.text?.contains("#end") == true
        val replies = if (zh) CLIENT_ZH else CLIENT_EN
        val turn = request.messages.count { it.role == Role.Counselor } - 1
        val text = if (ending) (if (zh) ENDING_ZH else ENDING_EN) else replies[turn.coerceAtLeast(0) % replies.size]
        typeOut(text).collect { emit(ChatEvent.Delta(it)) }
        if (ending) emit(ChatEvent.SessionEnd)
    }

    override fun supervision(request: TurnRequest): Flow<String> {
        // Same shape as the real report (backend #57, product #58): quotes are whole
        // counselor messages, never cut; suggestions follow "可以换成：" / "Try instead:"
        // without quote marks; 2 / 3 / 2 items, each starting with "- ".
        val counselor = request.messages.filter { it.role == Role.Counselor }.map { it.text }
        val first = counselor.firstOrNull() ?: "…"
        val last = counselor.lastOrNull() ?: first
        val report = (if (request.locale == ApiLocale.Zh) REPORT_ZH else REPORT_EN)
            .replace("{first}", first)
            .replace("{last}", last)
        return typeOut(report, chunk = 4)
    }

    private fun typeOut(text: String, chunk: Int = 1): Flow<String> = flow {
        delay(500)
        text.chunked(chunk).forEach {
            emit(it)
            delay(charDelayMillis)
        }
    }

    private companion object {
        val CASES = listOf(
            CaseSummary(
                id = "demo-depression",
                school = "cbt",
                title = LocalizedText(zh = "情绪低落的大学生", en = "A low-mood student"),
                summary = LocalizedText(
                    zh = "演示数据。20 岁，最近几个月提不起劲，常觉得自己不够好。",
                    en = "Demo data. 20 years old, low energy for months, often feels not good enough.",
                ),
                // This one carries every optional field; the other only a pseudonym, so both paths show.
                tags = listOf(LocalizedText(zh = "抑郁", en = "Depression")),
                difficulty = Difficulty.Intro,
                estimatedMinutes = 15,
                clientAlias = LocalizedText(zh = "小林", en = "Lin"),
                clientIntro = LocalizedText(
                    zh = "演示数据。小林，20 岁，大二学生。最近总提不起劲，室友劝他来聊聊。",
                    en = "Demo data. Lin, 20, a second-year student. Low for months; a roommate suggested talking to someone.",
                ),
                practiceFocus = listOf(
                    LocalizedText(zh = "建立关系", en = "Building rapport"),
                    LocalizedText(zh = "识别自动思维", en = "Spotting automatic thoughts"),
                ),
            ),
            CaseSummary(
                id = "demo-depression-anxiety",
                school = "cbt",
                title = LocalizedText(zh = "焦虑又疲惫的职场人", en = "An anxious, tired professional"),
                summary = LocalizedText(
                    zh = "演示数据。32 岁，工作压力大，睡不好，总担心出错。",
                    en = "Demo data. 32 years old, high work pressure, sleeps badly, worries about mistakes.",
                ),
                // Only a pseudonym: the other optional fields stay empty to show the fallbacks.
                clientAlias = LocalizedText(zh = "阿杰", en = "Jie"),
            ),
        )

        val CLIENT_ZH = listOf(
            "嗯……我也不知道从哪儿说起。最近就是觉得什么都没意思。",
            "早上醒来就不想起床，觉得起来了也没什么用。",
            "可能是吧。我总觉得别人都比我做得好。",
            "说出来好像轻松了一点点。",
        )
        const val ENDING_ZH = "我想今天先到这里。"
        const val ENDING_EN = "I think I'd like to stop here today."

        val CLIENT_EN = listOf(
            "Um… I don't really know where to start. Nothing feels worth it lately.",
            "I wake up and don't want to get out of bed. It feels pointless.",
            "Maybe. I keep thinking everyone else does better than me.",
            "Saying it out loud helps a little, I think.",
        )

        val REPORT_ZH = """
            ## 做得好的地方

            - 你说「{first}」，开场开放，给了来访者空间。（演示数据）
            - 来访者说完后你接着追问，保持了对话的节奏。（演示数据）

            ## 需要改进的地方

            - 你说「{last}」之前，还没有和来访者一起设定这次会谈的目标。可以换成：今天我们先聊聊最困扰你的一件事，好吗？（演示数据）
            - 还没有问到来访者最近的睡眠和日常状态。可以换成：最近这段时间，你睡得怎么样？（演示数据）
            - 反映感受可以更具体。可以换成：听起来你对自己挺失望的，是这样吗？（演示数据）

            ## 下次练什么

            - 会谈开始时，先和来访者共同设定议程。
            - 用苏格拉底式提问，探索一个具体情境。

            这份反馈由 AI 生成，仅供练习参考。
        """.trimIndent()

        val REPORT_EN = """
            ## What went well

            - You said "{first}", an open start that gave the client room. (Demo data)
            - You followed up after the client spoke, which kept the session moving. (Demo data)

            ## What to improve

            - Before you said "{last}", you hadn't set a goal for the session together. Try instead: Shall we start with the thing that troubles you most today? (Demo data)
            - You haven't asked about sleep and daily life yet. Try instead: How have you been sleeping lately? (Demo data)
            - Your reflections could name the feeling more precisely. Try instead: It sounds like you're quite disappointed in yourself. Is that right? (Demo data)

            ## What to practise next

            - Set an agenda together at the start of the session.
            - Use Socratic questions to explore one concrete situation.

            This feedback is AI-generated, for practice only.
        """.trimIndent()
    }
}
