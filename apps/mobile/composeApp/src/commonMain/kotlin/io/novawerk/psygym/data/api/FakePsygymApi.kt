package io.novawerk.psygym.data.api

import io.novawerk.psygym.domain.model.ApiLocale
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.LocalizedText
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
        val report = if (request.locale == ApiLocale.Zh) REPORT_ZH else REPORT_EN
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
            ## 演示报告

            > 这是演示数据，不是真实督导意见。

            ### 做得好的
            - 开场开放，给了来访者空间。
            - 有共情的回应。

            ### 可以改进的
            - 过早给建议，没有先澄清来访者的自动化思维。
            - 没有和来访者一起设定本次会谈目标。

            ### 下次练习
            1. 用苏格拉底式提问探索一个具体情境。
            2. 会谈开始时先共同设定议程。
        """.trimIndent()

        val REPORT_EN = """
            ## Demo report

            > This is demo data, not real supervision.

            ### What went well
            - An open start that gave the client room.
            - Empathic responses.

            ### What to improve
            - Advice came early, before exploring the client's automatic thoughts.
            - No shared goal for the session.

            ### Practise next
            1. Use Socratic questions to explore one concrete situation.
            2. Set an agenda together at the start.
        """.trimIndent()
    }
}
