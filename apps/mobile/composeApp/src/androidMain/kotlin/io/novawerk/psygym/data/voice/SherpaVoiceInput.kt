package io.novawerk.psygym.data.voice

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.ConnectivityManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.k2fsa.sherpa.onnx.EndpointConfig
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import io.novawerk.psygym.domain.voice.MicPermission
import io.novawerk.psygym.domain.voice.VoiceInput
import io.novawerk.psygym.domain.voice.VoiceLang
import io.novawerk.psygym.domain.voice.VoiceListener
import io.novawerk.psygym.domain.voice.VoiceReadiness
import io.novawerk.psygym.domain.voice.VoiceText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume
import kotlin.math.sqrt

/**
 * Hold-to-talk on Android: sherpa-onnx with X-ASR (ADR 0010). The model is downloaded once into
 * app-private storage; after that, everything runs offline. Audio stays in memory.
 *
 * Threads: one press is a [Session]. Its recorder thread only reads the microphone into a queue,
 * from the moment of the press, so nothing is lost while the model is still loading or a slow
 * phone decodes behind real time. Its decoder thread starts once the model is loaded and decodes
 * the queue in order. Every lifecycle step (start, finish, cancel, release, delete) runs under
 * [ops], so native objects are never freed while another step still uses them.
 */
class SherpaVoiceInput(context: Context, modelBaseUrl: String) : VoiceInput {
    private val app = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val modelDir = File(app.filesDir, "asr/${XAsrModel.DIR}")
    private val downloader = ModelDownloader(modelBaseUrl, modelDir, XAsrModel.files)

    /** Set by MainActivity: the permission prompt needs an Activity. */
    @Volatile var activity: ComponentActivity? = null

    private val _readiness = MutableStateFlow<VoiceReadiness>(VoiceReadiness.Unknown)
    override val readiness: StateFlow<VoiceReadiness> = _readiness
    private val _level = MutableStateFlow(0f)
    override val level: StateFlow<Float> = _level
    private val _preparing = MutableStateFlow(false)
    override val preparing: StateFlow<Boolean> = _preparing

    private var downloadJob: Job? = null

    /** Serialises start / finish / cancel / release / delete. Guards [session]. */
    private val ops = Mutex()
    private var session: Session? = null

    /** Guards [recognizer]: loading, freeing. */
    private val loadLock = Mutex()
    private var recognizer: OnlineRecognizer? = null

    override suspend fun refresh(lang: VoiceLang) {
        if (downloadJob?.isActive == true) return
        _readiness.value = if (downloader.installed()) VoiceReadiness.Ready else VoiceReadiness.NeedsDownload(XAsrModel.totalBytes)
    }

    override fun download(lang: VoiceLang) {
        if (downloadJob?.isActive == true) return
        _readiness.value = VoiceReadiness.Downloading(0f)
        downloadJob = scope.launch {
            val job = coroutineContext[Job]!!
            try {
                runInterruptible {
                    downloader.download(cancelled = { !job.isActive }) { _readiness.value = VoiceReadiness.Downloading(it) }
                }
                _readiness.value = VoiceReadiness.Ready
            } catch (e: CancellationException) {
                // Stopped on purpose (the model was deleted): whoever stopped it sets the state.
                throw e
            } catch (e: Exception) {
                // Interrupted or told to stop: not a failure, the state is someone else's to set.
                if (job.isActive && e !is ModelDownloader.Cancelled) _readiness.value = VoiceReadiness.DownloadFailed
            }
        }
    }

    override fun isMetered(): Boolean = try {
        (app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).isActiveNetworkMetered
    } catch (e: Exception) {
        false
    }

    // Not granted: always ask. The system answers "no" at once when the user said "don't ask
    // again", and then HoldToTalk shows the sheet with Open Settings. This also covers a
    // one-time grant that has expired.
    override fun micPermission(): MicPermission =
        if (app.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) MicPermission.Granted else MicPermission.NotAsked

    override suspend fun requestMic(): Boolean {
        val a = activity ?: return false
        return withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { cont ->
                val key = "voice-mic-${requests.incrementAndGet()}"
                lateinit var launcher: androidx.activity.result.ActivityResultLauncher<String>
                launcher = a.activityResultRegistry.register(key, ActivityResultContracts.RequestPermission()) { granted ->
                    launcher.unregister()
                    if (cont.isActive) cont.resume(granted)
                }
                cont.invokeOnCancellation { launcher.unregister() }
                launcher.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }

    override fun openSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", app.packageName, null))
        (activity ?: app).startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    override suspend fun warmUp(lang: VoiceLang) {
        loadRecognizer()
    }

    /** The loaded model, loading it first if needed. Null when it isn't downloaded or fails to load. */
    private suspend fun loadRecognizer(): OnlineRecognizer? = loadLock.withLock {
        recognizer?.let { return@withLock it }
        if (!downloader.installed()) return@withLock null
        _preparing.value = true
        try {
            withContext(Dispatchers.Default) { runCatching { load() }.getOrNull() }.also { recognizer = it }
        } finally {
            _preparing.value = false
        }
    }

    private fun load(): OnlineRecognizer {
        val d = modelDir.absolutePath
        val model = OnlineModelConfig(
            transducer = OnlineTransducerModelConfig("$d/encoder.int8.onnx", "$d/decoder.onnx", "$d/joiner.int8.onnx"),
            tokens = "$d/tokens.txt",
            numThreads = 2,
        )
        // Hold-to-talk: the finger decides where an utterance ends, so no endpointing.
        return OnlineRecognizer(
            config = OnlineRecognizerConfig(
                featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
                modelConfig = model,
                endpointConfig = EndpointConfig(),
                enableEndpoint = false,
            ),
        )
    }

    /** One press: the recorder thread, the queue, and (once the model is there) the decoder. */
    private inner class Session(val listener: VoiceListener) {
        val queue = LinkedBlockingQueue<FloatArray>()
        @Volatile var recording = true
        @Volatile var cancelled = false
        lateinit var recorder: Thread
        @Volatile var decoder: Thread? = null
        @Volatile var stream: OnlineStream? = null

        /** Loads the model, then starts decoding. Null when the model can't be used. */
        lateinit var ready: Deferred<OnlineRecognizer?>

        fun startDecoding() {
            ready = scope.async {
                val rec = loadRecognizer() ?: return@async null
                if (cancelled) return@async rec
                val s = rec.createStream()
                stream = s
                decoder = Thread {
                    while (true) {
                        val x = queue.take()
                        if (x === END || cancelled) break
                        s.acceptWaveform(x, SAMPLE_RATE)
                        while (rec.isReady(s)) rec.decode(s)
                        // A streaming transducer doesn't revise what it has emitted: all of it is stable.
                        if (recording && !cancelled) listener.onText(VoiceText.clean(rec.getResult(s).text), "")
                    }
                }.apply { name = "voice-decode"; start() }
                rec
            }
        }

        /** Stops the microphone, waits for the model and for the decoder to drain the queue. */
        suspend fun stop(): OnlineRecognizer? {
            recording = false
            withContext(Dispatchers.IO) { recorder.join() }
            val rec = ready.await()
            withContext(Dispatchers.IO) { decoder?.join() }
            return rec
        }
    }

    @SuppressLint("MissingPermission")
    override suspend fun start(lang: VoiceLang, listener: VoiceListener): Boolean = ops.withLock {
        session?.let { endSession(it, cancel = true) }
        session = null
        if (micPermission() != MicPermission.Granted || !downloader.installed()) return@withLock false
        val s = Session(listener)
        val test = VoiceTestAudio.file(app.filesDir)
        s.recorder = if (test != null) fileRecorder(test, s) else micRecorder(s) ?: return@withLock false
        s.recorder.apply { name = "voice-record"; start() }
        s.startDecoding()
        session = s
        true
    }

    /** Reads the microphone into the queue until [Session.recording] goes false. Null if it won't open. */
    @SuppressLint("MissingPermission")
    private fun micRecorder(s: Session): Thread? {
        val min = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (min <= 0) return null
        val ar = try {
            AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, CHUNK * 4))
        } catch (e: Exception) {
            return null
        }
        if (ar.state != AudioRecord.STATE_INITIALIZED) { ar.release(); return null }
        return Thread {
            try {
                ar.startRecording()
                if (ar.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                    val buf = ShortArray(CHUNK)
                    while (s.recording) {
                        val n = ar.read(buf, 0, buf.size)
                        // An error code (the microphone was taken, the service died): stop, keep what we have.
                        if (n < 0) break
                        if (n == 0) continue
                        val x = FloatArray(n) { buf[it] / 32768f }
                        _level.value = (rms(x) * 8).coerceIn(0f, 1f)
                        s.queue.put(x)
                    }
                }
            } catch (e: Exception) {
                // A recording failure must never take the app down: finish with what was heard.
            } finally {
                runCatching { ar.stop() }
                ar.release()
                _level.value = 0f
                s.queue.put(END)
            }
        }
    }

    /** Debug builds only ([VoiceTestAudio]): a wav file in real time instead of the microphone. */
    private fun fileRecorder(wav: File, s: Session): Thread {
        val b = wav.readBytes()
        // 16-bit PCM after the "data" chunk header.
        val start = (12 until b.size - 8).firstOrNull { b[it] == 'd'.code.toByte() && b[it + 1] == 'a'.code.toByte() && b[it + 2] == 't'.code.toByte() && b[it + 3] == 'a'.code.toByte() }?.plus(8) ?: 44
        val pcm = FloatArray((b.size - start) / 2) { i -> ((b[start + 2 * i + 1].toInt() shl 8) or (b[start + 2 * i].toInt() and 0xff)).toShort() / 32768f }
        return Thread {
            var i = 0
            while (s.recording) {
                val x = if (i < pcm.size) pcm.copyOfRange(i, minOf(i + CHUNK, pcm.size)) else FloatArray(CHUNK)
                i += x.size
                _level.value = (rms(x) * 8).coerceIn(0f, 1f)
                s.queue.put(x)
                Thread.sleep(100)
            }
            _level.value = 0f
            s.queue.put(END)
        }
    }

    override suspend fun finish(): String = ops.withLock {
        val s = session ?: return@withLock ""
        session = null
        endSession(s, cancel = false)
    }

    /** Ends [s]; with [cancel], drops what was heard. Call under [ops]. */
    private suspend fun endSession(s: Session, cancel: Boolean): String {
        if (cancel) s.cancelled = true
        val rec = s.stop()
        val stream = s.stream ?: return ""
        if (rec == null || cancel) {
            stream.release()
            return ""
        }
        return withContext(Dispatchers.Default) {
            // The model needs right context to emit the last words: 1.5 s of silence (voice-input.md §2).
            stream.acceptWaveform(FloatArray(TAIL_PADDING), SAMPLE_RATE)
            stream.inputFinished()
            while (rec.isReady(stream)) rec.decode(stream)
            val text = VoiceText.clean(rec.getResult(stream).text)
            stream.release()
            text
        }
    }

    override fun cancel() {
        // Undispatched: takes the lock now if it's free, so a quick next press queues behind it.
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            ops.withLock {
                val s = session ?: return@withLock
                session = null
                endSession(s, cancel = true)
            }
        }
    }

    override fun release() {
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            // Waits for a finish() in progress: the recognizer is never freed under it.
            ops.withLock {
                session?.let { endSession(it, cancel = true) }
                session = null
                freeRecognizer()
            }
        }
    }

    private suspend fun freeRecognizer() {
        loadLock.withLock {
            recognizer?.release()
            recognizer = null
        }
    }

    override fun modelBytes(): Long = downloader.bytesOnDisk()

    override suspend fun deleteModel() {
        // Stop the download first: its read loop checks for cancellation and drops the connection.
        downloadJob?.cancelAndJoin()
        ops.withLock {
            session?.let { endSession(it, cancel = true) }
            session = null
            freeRecognizer()
        }
        withContext(Dispatchers.IO) { downloader.delete() }
        _readiness.value = VoiceReadiness.NeedsDownload(XAsrModel.totalBytes)
    }

    private fun rms(x: FloatArray): Float {
        var e = 0.0
        for (v in x) e += v * v
        return sqrt(e / x.size).toFloat()
    }

    private companion object {
        const val SAMPLE_RATE = 16_000
        /** 100 ms per read. */
        const val CHUNK = 1_600
        const val TAIL_PADDING = 24_000
        val requests = AtomicInteger()
        /** Marks the end of the audio queue. */
        val END = FloatArray(0)
    }
}
