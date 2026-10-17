package io.novawerk.psygym.data.voice

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.concurrent.LinkedBlockingQueue

/** The native recognizer, behind an interface so the lifecycle below can be tested without it. */
internal interface AsrBackend<R : Any, S : Any> {
    /** Blocking; may take a while. Throws if the model can't be loaded. */
    fun load(): R

    fun free(r: R)

    fun createStream(r: R): S

    /** Feeds audio and decodes what's ready; returns the text so far. */
    fun accept(r: R, s: S, samples: FloatArray): String

    /** Ends the stream (with the tail padding) and returns the final text. */
    fun finish(r: R, s: S): String

    fun freeStream(s: S)
}

/** Starts a thread that puts audio chunks on the queue while [recording] is true, then [AsrSessions.END]. */
internal typealias RecorderFactory = (queue: LinkedBlockingQueue<FloatArray>, recording: () -> Boolean) -> Thread?

/**
 * Hold-to-talk sessions on one recognizer, safe against every order of start / finish / cancel /
 * release / reset: they run one at a time under [ops], and once begun they always run to the end
 * (NonCancellable), so a native object is never freed while a thread still uses it.
 *
 * One press is a [Session]: a recorder thread that only fills a queue (from the press on, so
 * nothing is lost while the model loads), and a decoder thread started once the model is loaded.
 */
internal class AsrSessions<R : Any, S : Any>(
    private val backend: AsrBackend<R, S>,
    private val scope: CoroutineScope,
    private val modelReady: () -> Boolean,
) {
    private val ops = Mutex()
    private var session: Session? = null

    private val loadLock = Mutex()
    private var recognizer: R? = null

    private val _preparing = MutableStateFlow(false)
    val preparing: StateFlow<Boolean> = _preparing

    private inner class Session(val onText: (String) -> Unit) {
        val queue = LinkedBlockingQueue<FloatArray>()
        @Volatile var recording = true
        @Volatile var cancelled = false
        lateinit var recorder: Thread
        @Volatile var decoder: Thread? = null
        @Volatile var stream: S? = null
        lateinit var ready: Deferred<R?>

        fun startDecoding() {
            ready = scope.async {
                val rec = loadRecognizer() ?: return@async null
                if (cancelled) return@async rec
                val s = backend.createStream(rec)
                stream = s
                decoder = Thread {
                    while (true) {
                        val x = queue.take()
                        if (x === END || cancelled) break
                        val text = backend.accept(rec, s, x)
                        if (recording && !cancelled) onText(text)
                    }
                }.apply { name = "voice-decode"; start() }
                rec
            }
        }
    }

    /** The loaded recognizer, loading it if needed; null when the model isn't there or won't load. */
    suspend fun loadRecognizer(): R? = loadLock.withLock {
        recognizer?.let { return@withLock it }
        if (!modelReady()) return@withLock null
        _preparing.value = true
        try {
            // Not cancellable, and kept inside the block: withContext throws on return when the
            // caller was cancelled, so an assignment after it would be skipped. A recognizer loaded
            // for a caller that left is kept (and freed by release()), never left to the GC.
            withContext(Dispatchers.Default + NonCancellable) {
                runCatching { backend.load() }.getOrNull().also { recognizer = it }
            }
        } finally {
            _preparing.value = false
        }
    }

    /** Starts a press. False when the recorder can't start. */
    suspend fun start(recorder: RecorderFactory, onText: (String) -> Unit): Boolean = withContext(NonCancellable) {
        ops.withLock {
            session?.let { end(it, cancel = true) }
            session = null
            if (!modelReady()) return@withLock false
            val s = Session(onText)
            s.recorder = recorder(s.queue) { s.recording } ?: return@withLock false
            s.recorder.apply { name = "voice-record"; start() }
            s.startDecoding()
            session = s
            true
        }
    }

    /** Ends the press and returns its text. Runs to the end even if the caller is cancelled. */
    suspend fun finish(): String = withContext(NonCancellable) {
        ops.withLock {
            val s = session ?: return@withLock ""
            session = null
            end(s, cancel = false)
        }
    }

    fun cancel() {
        // Undispatched: takes the lock now if it's free, so a quick next press queues behind it.
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            ops.withLock {
                val s = session ?: return@withLock
                session = null
                end(s, cancel = true)
            }
        }
    }

    /** Drops any press and frees the recognizer, after whatever step is running. */
    fun release(): kotlinx.coroutines.Job = scope.launch(start = CoroutineStart.UNDISPATCHED) { releaseNow() }

    suspend fun releaseNow() = withContext(NonCancellable) {
        ops.withLock {
            session?.let { end(it, cancel = true) }
            session = null
            loadLock.withLock {
                recognizer?.let { backend.free(it) }
                recognizer = null
            }
        }
    }

    /** Call under [ops]: stops the recorder, waits for the model and the decoder, then ends the stream. */
    private suspend fun end(s: Session, cancel: Boolean): String {
        if (cancel) s.cancelled = true
        s.recording = false
        withContext(Dispatchers.IO) { s.recorder.join() }
        val rec = s.ready.await()
        withContext(Dispatchers.IO) { s.decoder?.join() }
        val stream = s.stream ?: return ""
        if (rec == null || cancel) {
            backend.freeStream(stream)
            return ""
        }
        return withContext(Dispatchers.Default) {
            try {
                backend.finish(rec, stream)
            } finally {
                backend.freeStream(stream)
            }
        }
    }

    companion object {
        /** Marks the end of the audio queue. */
        val END = FloatArray(0)
    }
}
