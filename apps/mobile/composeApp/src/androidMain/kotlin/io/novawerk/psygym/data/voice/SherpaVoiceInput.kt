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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
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

    private var downloadJob: Job? = null
    private val loadLock = Mutex()
    private var recognizer: OnlineRecognizer? = null
    private var stream: OnlineStream? = null
    private var threads: List<Thread> = emptyList()
    @Volatile private var listening = false

    override suspend fun refresh(lang: VoiceLang) {
        if (downloadJob?.isActive == true) return
        _readiness.value = if (downloader.installed()) VoiceReadiness.Ready else VoiceReadiness.NeedsDownload(XAsrModel.totalBytes)
    }

    override fun download(lang: VoiceLang) {
        if (downloadJob?.isActive == true) return
        _readiness.value = VoiceReadiness.Downloading(0f)
        downloadJob = scope.launch {
            _readiness.value = try {
                downloader.download { _readiness.value = VoiceReadiness.Downloading(it) }
                VoiceReadiness.Ready
            } catch (e: Exception) {
                VoiceReadiness.DownloadFailed
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
        loadLock.withLock {
            if (recognizer != null || !downloader.installed()) return
            recognizer = withContext(Dispatchers.Default) { load() }
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

    @SuppressLint("MissingPermission")
    override suspend fun start(lang: VoiceLang, listener: VoiceListener): Boolean {
        warmUp(lang)
        val rec = recognizer ?: return false
        if (micPermission() != MicPermission.Granted) return false
        val s = rec.createStream()
        val queue = LinkedBlockingQueue<FloatArray>()
        val test = VoiceTestAudio.file(app.filesDir)
        val recorder: Thread
        if (test != null) {
            recorder = fileRecorder(test, queue)
        } else {
            val min = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val ar = try {
                AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, CHUNK * 4))
            } catch (e: Exception) {
                s.release(); return false
            }
            if (ar.state != AudioRecord.STATE_INITIALIZED) { ar.release(); s.release(); return false }
            // Only reads the microphone, never waits on the model: a slow phone mustn't lose audio.
            recorder = Thread {
                val buf = ShortArray(CHUNK)
                try {
                    ar.startRecording()
                    while (listening) {
                        val n = ar.read(buf, 0, buf.size)
                        if (n <= 0) continue
                        val x = FloatArray(n) { buf[it] / 32768f }
                        _level.value = (rms(x) * 8).coerceIn(0f, 1f)
                        queue.put(x)
                    }
                } finally {
                    ar.stop(); ar.release(); _level.value = 0f
                    queue.put(END)
                }
            }
        }
        // Decodes everything queued, in order, until the recorder says it's done.
        val decoder = Thread {
            while (true) {
                val x = queue.take()
                if (x === END) break
                s.acceptWaveform(x, SAMPLE_RATE)
                while (rec.isReady(s)) rec.decode(s)
                // A streaming transducer doesn't revise what it has emitted: all of it is stable.
                if (listening) listener.onText(VoiceText.clean(rec.getResult(s).text), "")
            }
        }
        stream = s
        listening = true
        threads = listOf(recorder, decoder)
        recorder.apply { name = "voice-record"; start() }
        decoder.apply { name = "voice-decode"; start() }
        return true
    }

    /** Debug builds only ([VoiceTestAudio]): a wav file in real time instead of the microphone. */
    private fun fileRecorder(wav: File, queue: LinkedBlockingQueue<FloatArray>): Thread {
        val b = wav.readBytes()
        // 16-bit PCM after the "data" chunk header.
        val start = (12 until b.size - 8).firstOrNull { b[it] == 'd'.code.toByte() && b[it + 1] == 'a'.code.toByte() && b[it + 2] == 't'.code.toByte() && b[it + 3] == 'a'.code.toByte() }?.plus(8) ?: 44
        val pcm = FloatArray((b.size - start) / 2) { i -> ((b[start + 2 * i + 1].toInt() shl 8) or (b[start + 2 * i].toInt() and 0xff)).toShort() / 32768f }
        return Thread {
            var i = 0
            while (listening) {
                val x = if (i < pcm.size) pcm.copyOfRange(i, minOf(i + CHUNK, pcm.size)) else FloatArray(CHUNK)
                i += x.size
                _level.value = (rms(x) * 8).coerceIn(0f, 1f)
                queue.put(x)
                Thread.sleep(100)
            }
            _level.value = 0f
            queue.put(END)
        }
    }

    override suspend fun finish(): String = withContext(Dispatchers.Default) {
        val rec = recognizer
        val s = stopRecording() ?: return@withContext ""
        rec ?: return@withContext ""
        // The model needs right context to emit the last words: 1.5 s of silence (voice-input.md §2).
        s.acceptWaveform(FloatArray(TAIL_PADDING), SAMPLE_RATE)
        s.inputFinished()
        while (rec.isReady(s)) rec.decode(s)
        val text = VoiceText.clean(rec.getResult(s).text)
        s.release()
        text
    }

    override fun cancel() {
        scope.launch { stopRecording()?.release() }
    }

    /** Stops the microphone, then waits until everything it heard has been decoded. */
    private fun stopRecording(): OnlineStream? {
        listening = false
        threads.forEach { it.join() }
        threads = emptyList()
        return stream.also { stream = null }
    }

    override fun release() {
        scope.launch {
            stopRecording()?.release()
            loadLock.withLock {
                recognizer?.release()
                recognizer = null
            }
        }
    }

    override fun modelBytes(): Long = downloader.bytesOnDisk()

    override suspend fun deleteModel() {
        downloadJob?.cancel()
        loadLock.withLock {
            recognizer?.release()
            recognizer = null
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
