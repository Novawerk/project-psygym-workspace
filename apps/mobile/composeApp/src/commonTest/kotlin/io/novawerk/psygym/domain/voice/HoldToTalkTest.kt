package io.novawerk.psygym.domain.voice

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private class FakeVoice(var permission: MicPermission = MicPermission.Granted, var heard: String = "你好") : VoiceInput {
    override val readiness: StateFlow<VoiceReadiness> = MutableStateFlow(VoiceReadiness.Ready)
    override val level: StateFlow<Float> = MutableStateFlow(0f)
    override val preparing: StateFlow<Boolean> = MutableStateFlow(false)
    var started = 0
    var cancelled = 0
    var finished = 0
    var grant = true
    var startOk = true
    var listener: VoiceListener? = null
    override suspend fun refresh(lang: VoiceLang) {}
    override fun download(lang: VoiceLang) {}
    override fun isMetered() = false
    override fun micPermission() = permission
    override suspend fun requestMic(): Boolean {
        permission = if (grant) MicPermission.Granted else MicPermission.Denied
        return grant
    }
    override fun openSettings() {}
    override suspend fun warmUp(lang: VoiceLang) {}
    override suspend fun start(lang: VoiceLang, listener: VoiceListener): Boolean {
        started++
        this.listener = listener
        return startOk
    }
    override suspend fun finish(): String { finished++; return heard }
    override fun cancel() { cancelled++ }
    override fun release() {}
    override fun modelBytes() = 0L
    override suspend fun deleteModel() {}
}

@OptIn(ExperimentalCoroutinesApi::class)
class HoldToTalkTest {
    @Test
    fun pressSpeakRelease_givesTheText() = runTest {
        val v = FakeVoice(heard = "你刚才说什么？")
        val h = HoldToTalk(v, backgroundScope)
        val events = mutableListOf<HoldToTalk.Event>()
        backgroundScope.launch { h.events.collect { events += it } }
        runCurrent()
        h.press(VoiceLang.Zh)
        runCurrent()
        v.listener!!.onText("你刚才", "说什么")
        assertEquals(HoldToTalk.Phase.Listening("你刚才", "说什么", 0, false), h.phase.value)
        h.release()
        runCurrent()
        assertEquals(HoldToTalk.Phase.Idle, h.phase.value)
        assertEquals(listOf<HoldToTalk.Event>(HoldToTalk.Event.Heard("你刚才说什么？")), events)
    }

    @Test
    fun releaseInTheCancelZone_dropsIt() = runTest {
        val v = FakeVoice()
        val h = HoldToTalk(v, backgroundScope)
        h.press(VoiceLang.Zh)
        runCurrent()
        h.cancelZone(true)
        assertTrue((h.phase.value as HoldToTalk.Phase.Listening).cancelling)
        h.release()
        runCurrent()
        assertEquals(1, v.cancelled)
        assertEquals(0, v.finished)
        assertEquals(HoldToTalk.Phase.Idle, h.phase.value)
    }

    @Test
    fun nothingHeard() = runTest {
        val v = FakeVoice(heard = "  ")
        val h = HoldToTalk(v, backgroundScope)
        val events = mutableListOf<HoldToTalk.Event>()
        backgroundScope.launch { h.events.collect { events += it } }
        runCurrent()
        h.press(VoiceLang.En); runCurrent(); h.release(); runCurrent()
        assertEquals(listOf<HoldToTalk.Event>(HoldToTalk.Event.NothingHeard), events)
    }

    @Test
    fun firstPress_onlyAsksForTheMicrophone() = runTest {
        val v = FakeVoice(permission = MicPermission.NotAsked)
        val h = HoldToTalk(v, backgroundScope)
        h.press(VoiceLang.Zh); runCurrent(); h.release(); runCurrent()
        assertEquals(0, v.started)
        assertEquals(MicPermission.Granted, v.permission)
        // The next press records.
        h.press(VoiceLang.Zh); runCurrent()
        assertEquals(1, v.started)
    }

    @Test
    fun deniedMicrophone_saysSo() = runTest {
        val v = FakeVoice(permission = MicPermission.Denied)
        val h = HoldToTalk(v, backgroundScope)
        val events = mutableListOf<HoldToTalk.Event>()
        backgroundScope.launch { h.events.collect { events += it } }
        runCurrent()
        h.press(VoiceLang.Zh); runCurrent()
        assertEquals(listOf<HoldToTalk.Event>(HoldToTalk.Event.MicDenied), events)
        assertEquals(0, v.started)
    }

    @Test
    fun stopsByItselfAtTheLimit() = runTest {
        val v = FakeVoice()
        val h = HoldToTalk(v, backgroundScope, maxSeconds = 3)
        h.press(VoiceLang.Zh); runCurrent()
        advanceTimeBy(2_100)
        assertEquals(2, (h.phase.value as HoldToTalk.Phase.Listening).seconds)
        advanceTimeBy(1_000); runCurrent()
        assertEquals(1, v.finished)
        assertEquals(HoldToTalk.Phase.Idle, h.phase.value)
        advanceUntilIdle()
    }

    @Test
    fun startFails_backToIdle() = runTest {
        val v = FakeVoice().apply { startOk = false }
        val h = HoldToTalk(v, backgroundScope)
        val events = mutableListOf<HoldToTalk.Event>()
        backgroundScope.launch { h.events.collect { events += it } }
        runCurrent()
        h.press(VoiceLang.Zh); runCurrent()
        assertEquals(HoldToTalk.Phase.Idle, h.phase.value)
        assertEquals(listOf<HoldToTalk.Event>(HoldToTalk.Event.Failed), events)
    }
}

class VoiceTextTest {
    @Test
    fun clean_dropsSpacesAroundChinese() {
        assertEquals("最近什么都不想做，早上起不来，觉得自己挺没用的", VoiceText.clean(" 最近什么都不想做， 早上起不来， 觉得自己挺没用的 "))
        assertEquals("我们用 CBT 的方法", VoiceText.clean("我们用 CBT 的方法"))
        assertEquals("What went through your mind?", VoiceText.clean("What went  through your mind?"))
    }

    @Test
    fun append_spacesOnlyBetweenLatinWords() {
        assertEquals("你好今天", VoiceText.append("你好", "今天"))
        assertEquals("Hello there", VoiceText.append("Hello", "there"))
        assertEquals("Hello. There", VoiceText.append("Hello. ", "There"))
        assertEquals("说", VoiceText.append("", "说"))
    }
}
