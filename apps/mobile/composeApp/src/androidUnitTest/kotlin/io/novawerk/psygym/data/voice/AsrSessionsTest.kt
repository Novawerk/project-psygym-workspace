package io.novawerk.psygym.data.voice

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Native objects are never used after they're freed, whatever order the page drives things in. */
class AsrSessionsTest {
    private class Rec(val id: Int) { @Volatile var freed = false }
    private class Stream { @Volatile var freed = false; val text = StringBuilder() }

    /** Records every use of a freed object. [gate] holds the model load until opened. */
    private class FakeBackend : AsrBackend<Rec, Stream> {
        val gate = CountDownLatch(1)
        val violations: MutableList<String> = Collections.synchronizedList(mutableListOf())
        val live = AtomicInteger()
        val loads = AtomicInteger()
        val frees = AtomicInteger()

        override fun load(): Rec {
            gate.await()
            return Rec(loads.incrementAndGet())
        }

        override fun free(r: Rec) {
            if (live.get() > 0) violations += "recognizer freed with ${live.get()} live stream(s)"
            r.freed = true
            frees.incrementAndGet()
        }

        override fun createStream(r: Rec): Stream {
            if (r.freed) violations += "createStream on a freed recognizer"
            live.incrementAndGet()
            return Stream()
        }

        override fun accept(r: Rec, s: Stream, samples: FloatArray): String {
            if (r.freed || s.freed) violations += "accept after free"
            Thread.sleep(5)
            s.text.append('a')
            return s.text.toString()
        }

        override fun finish(r: Rec, s: Stream): String {
            if (r.freed || s.freed) violations += "finish after free"
            return s.text.toString()
        }

        override fun freeStream(s: Stream) {
            if (s.freed) violations += "stream freed twice"
            s.freed = true
            live.decrementAndGet()
        }
    }

    /** Three chunks of audio, then silence until the press ends. */
    private val recorder: RecorderFactory = { queue, recording ->
        Thread {
            repeat(3) { queue.put(FloatArray(160)) }
            while (recording()) Thread.sleep(5)
            queue.put(AsrSessions.END)
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val backend = FakeBackend()
    private val asr = AsrSessions(backend, scope) { true }

    @AfterTest
    fun stop() = scope.cancel()

    @Test
    fun releasedWhileAFinishWaitsForTheModel_nothingIsUsedAfterFree() = runBlocking {
        // Press while "preparing", let go, leave the page before the model has loaded.
        assertTrue(asr.start(recorder) {})
        val page = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        page.launch { asr.finish() }
        delay(100)
        page.cancel() // rememberCoroutineScope is cancelled with the page
        val release = asr.release()
        delay(100)
        backend.gate.countDown() // the model finishes loading
        withTimeout(5_000) { release.join() }
        assertEquals(emptyList(), backend.violations)
        assertEquals(0, backend.live.get(), "every stream freed")
        assertEquals(1, backend.frees.get(), "the recognizer freed once")
    }

    @Test
    fun pressedWhileLoading_theAudioWaitsForTheModel() = runBlocking {
        assertTrue(asr.start(recorder) {})
        val text = async { asr.finish() }
        delay(100)
        backend.gate.countDown()
        assertEquals("aaa", withTimeout(5_000) { text.await() })
        assertEquals(emptyList(), backend.violations)
    }

    @Test
    fun cancelThenPressAgainAtOnce_theSecondPressIsUntouched() = runBlocking {
        backend.gate.countDown()
        assertTrue(asr.start(recorder) {})
        delay(50)
        asr.cancel()
        assertTrue(asr.start(recorder) {})
        assertEquals("aaa", withTimeout(5_000) { asr.finish() })
        assertEquals(emptyList(), backend.violations)
        assertEquals(0, backend.live.get())
    }

    @Test
    fun warmUpCancelledMidLoad_theRecognizerIsKeptAndFreedByRelease() = runBlocking {
        val warm = scope.launch { asr.loadRecognizer() }
        delay(50)
        warm.cancel()
        backend.gate.countDown()
        delay(100)
        withTimeout(5_000) { asr.release().join() }
        assertEquals(1, backend.loads.get())
        assertEquals(1, backend.frees.get(), "loaded once, freed once: not left to the garbage collector")
    }
}
