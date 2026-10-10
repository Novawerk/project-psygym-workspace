package io.novawerk.psygym.data.api

import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
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

    override fun chat(request: TurnRequest): Flow<String> {
        val replies = if (request.locale == ApiLocale.Zh) CLIENT_ZH else CLIENT_EN
        val turn = request.messages.size / 2
        return typeOut(replies[turn % replies.size])
    }

    override fun supervision(request: TurnRequest): Flow<String> {
        // Same shape as the real report (acceptance C1, C2, C7), so switching doesn't jump.
        val quote = request.messages.firstOrNull { it.role == Role.Counselor }?.text?.take(40) ?: "…"
        val report = (if (request.locale == ApiLocale.Zh) REPORT_ZH else REPORT_EN).replace("{quote}", quote)
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
                title = LocalizedText(zh = "【演示】情绪低落的大学生", en = "[Demo] A low-mood student"),
                summary = LocalizedText(
                    zh = "演示数据。20 岁，最近几个月提不起劲，常觉得自己不够好。",
                    en = "Demo data. 20 years old, low energy for months, often feels not good enough.",
                ),
            ),
            CaseSummary(
                id = "demo-depression-anxiety",
                school = "cbt",
                title = LocalizedText(zh = "【演示】焦虑又疲惫的职场人", en = "[Demo] An anxious, tired professional"),
                summary = LocalizedText(
                    zh = "演示数据。32 岁，工作压力大，睡不好，总担心出错。",
                    en = "Demo data. 32 years old, high work pressure, sleeps badly, worries about mistakes.",
                ),
            ),
        )

        val CLIENT_ZH = listOf(
            "嗯……我也不知道从哪儿说起。最近就是觉得什么都没意思。",
            "早上醒来就不想起床，觉得起来了也没什么用。",
            "可能是吧。我总觉得别人都比我做得好。",
            "说出来好像轻松了一点点。",
        )
        val CLIENT_EN = listOf(
            "Um… I don't really know where to start. Nothing feels worth it lately.",
            "I wake up and don't want to get out of bed. It feels pointless.",
            "Maybe. I keep thinking everyone else does better than me.",
            "Saying it out loud helps a little, I think.",
        )

        val REPORT_ZH = """
            ## 做得好的地方

            - 你说「{quote}」：开场开放，给了来访者空间。（演示数据）

            ## 需要改进的地方

            - 你还没有和来访者一起设定这次会谈的目标。可以换成：「今天我们先聊聊最困扰你的一件事，好吗？」（演示数据）

            ## 下次练什么

            1. 用苏格拉底式提问探索一个具体情境。
            2. 会谈开始时先共同设定议程。

            这份反馈由 AI 生成，仅供练习参考。
        """.trimIndent()

        val REPORT_EN = """
            ## What went well

            - You said "{quote}": an open start that gave the client room. (Demo data)

            ## What to improve

            - You haven't set a goal for the session together. Try: "Shall we start with the thing that troubles you most today?" (Demo data)

            ## What to practise next

            1. Use Socratic questions to explore one concrete situation.
            2. Set an agenda together at the start.

            This feedback is AI-generated, for practice only.
        """.trimIndent()
    }
}
