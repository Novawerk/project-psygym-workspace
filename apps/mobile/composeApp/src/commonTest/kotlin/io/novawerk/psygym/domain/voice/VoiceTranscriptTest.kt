package io.novawerk.psygym.domain.voice

import io.novawerk.psygym.domain.model.ContractLimits
import io.novawerk.psygym.domain.model.Message
import io.novawerk.psygym.domain.model.Role
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

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

    @Test
    fun captionFollowsTheVoiceNotTheText() {
        val caption = VoiceCaption()
        caption.newReply()
        repeat(10) { caption.tick(100, speaking = true, length = 200, charsPerSecond = 5.0) }
        assertEquals(5, caption.shown)
        caption.tick(100, speaking = false, length = 200, charsPerSecond = 5.0)
        assertEquals(5, caption.shown) // a pause between pieces
        repeat(10) { caption.tick(100, speaking = false, length = 200, charsPerSecond = 5.0) }
        assertEquals(200, caption.shown)
    }

    @Test
    fun captionNeverGoesBackAndNeverOutrunsTheText() {
        val caption = VoiceCaption()
        caption.newReply()
        repeat(100) { caption.tick(100, speaking = true, length = 20, charsPerSecond = 5.0) }
        assertEquals(20, caption.shown)
        repeat(10) { caption.tick(100, speaking = true, length = 40, charsPerSecond = 5.0) }
        assertTrue(caption.shown in 20..40)
    }

    @Test
    fun textWithNoVoiceStillGetsShown() {
        val caption = VoiceCaption()
        caption.newReply()
        repeat(24) { caption.tick(100, speaking = false, length = 30, charsPerSecond = 5.0) }
        assertEquals(0, caption.shown)
        caption.tick(100, speaking = false, length = 30, charsPerSecond = 5.0)
        assertEquals(30, caption.shown)
    }

    @Test
    fun goingOnAfterASilenceStartsWhereItStopped() {
        val caption = VoiceCaption()
        caption.finish()
        caption.goOnFrom(30)
        repeat(10) { caption.tick(100, speaking = true, length = 60, charsPerSecond = 5.0) }
        assertEquals(35, caption.shown)
    }

    @Test
    fun visibleHidesOnlyWhatIsNotSpokenYet() {
        val text = listOf(Message(role = Role.Counselor, text = "你好"), Message(role = Role.Client, text = "今天有点累"))
        assertEquals(listOf(text[0]), VoiceTranscript.visible(text, 0))
        assertEquals("今天", VoiceTranscript.visible(text, 2).last().text)
        assertEquals(text, VoiceTranscript.visible(text, Int.MAX_VALUE))
        assertEquals(text.take(1), VoiceTranscript.visible(text.take(1), 0))
    }
}
