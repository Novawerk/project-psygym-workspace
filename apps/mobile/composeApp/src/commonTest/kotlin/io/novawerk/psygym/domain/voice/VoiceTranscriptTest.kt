package io.novawerk.psygym.domain.voice

import io.novawerk.psygym.domain.model.ContractLimits
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import kotlin.test.Test
import kotlin.test.assertEquals

class VoiceTranscriptTest {
    private val counselor = Role.Counselor
    private val client = Role.Client

    @Test
    fun theTraineesSilenceIsNotALine() {
        assertEquals(emptyList(), VoiceTranscript.add(emptyList(), counselor, " ... "))
        assertEquals(emptyList(), VoiceTranscript.add(emptyList(), counselor, "…"))
    }

    @Test
    fun twoTurnsInARowAreOneMessage() {
        val zh = VoiceTranscript.add(listOf(Message(counselor, "你好。")), counselor, "今天怎么样？")
        assertEquals(listOf(Message(counselor, "你好。今天怎么样？")), zh)
        val en = VoiceTranscript.add(listOf(Message(counselor, "Hi.")), counselor, "How are you?")
        assertEquals(listOf(Message(counselor, "Hi. How are you?")), en)
    }

    @Test
    fun aLongReplyStaysWithinTheContract() {
        val long = "字".repeat(ContractLimits.MAX_MESSAGE_CHARS + 50)
        assertEquals(ContractLimits.MAX_MESSAGE_CHARS, VoiceTranscript.add(emptyList(), client, long).single().text.length)
        val many = (1..ContractLimits.MAX_MESSAGES).map { Message(if (it % 2 == 0) counselor else client, "$it") }
        val added = VoiceTranscript.add(many, client, "last")
        assertEquals(ContractLimits.MAX_MESSAGES, added.size)
        assertEquals("last", added.last().text)
    }

    @Test
    fun anInterruptedReplyKeepsWhatWasSaid() {
        val before = listOf(Message(counselor, "嗯"), Message(client, "我最近，就是，一直睡不好，然后"))
        assertEquals(Message(client, "我最近，就是"), VoiceTranscript.correct(before, "我最近，就是，一直睡不好，然后", "我最近，就是").last())
        // Cut off before a word came out: the reply is gone.
        assertEquals(before.take(1), VoiceTranscript.correct(before, "我最近，就是，一直睡不好，然后", " "))
        assertEquals(before.take(1), VoiceTranscript.correct(before.take(1), "x", "y"))
    }

    @Test
    fun cuttingOffALongReplyOnlyTouchesTheLastPiece() {
        val first = VoiceTranscript.add(emptyList(), client, "第一段说完了。")
        val both = VoiceTranscript.add(first, client, "第二段说到一半，后面没说。")
        val cut = VoiceTranscript.correct(both, "第二段说到一半，后面没说。", "第二段说到一半")
        assertEquals("第一段说完了。第二段说到一半", cut.single().text)
        // A piece we never saw changes nothing.
        assertEquals(both, VoiceTranscript.correct(both, "别的", "x"))
    }
}
