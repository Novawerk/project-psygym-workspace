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
    private val prefs = app.getSharedPreferences("voice", Context.MODE_PRIVATE)

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
    private var thread: Thread? = null
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

    override fun isMetered(): Boolean =
        (app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).isActiveNetworkMetered

    override fun micPermission(): MicPermission {
        if (app.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return MicPermission.Granted
        if (!prefs.getBoolean(ASKED, false)) return MicPermission.NotAsked
        // Asked before: the system only prompts again while it would show a rationale.
        val a = activity ?: return MicPermission.Denied
        return if (a.shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)) MicPermission.NotAsked else MicPermission.Denied
    }

    override suspend fun requestMic(): Boolean {
        val a = activity ?: return false
        prefs.edit().putBoolean(ASKED, true).apply()
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
        val min = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val ar = try {
            AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, CHUNK * 4))
        } catch (e: Exception) {
            s.release(); return false
        }
        if (ar.state != AudioRecord.STATE_INITIALIZED) { ar.release(); s.release(); return false }
        stream = s
        listening = true
        thread = Thread {
            val buf = ShortArray(CHUNK)
            try {
                ar.startRecording()
                while (listening) {
                    val n = ar.read(buf, 0, buf.size)
                    if (n <= 0) continue
                    val x = FloatArray(n) { buf[it] / 32768f }
                    _level.value = (rms(x) * 8).coerceIn(0f, 1f)
                    s.acceptWaveform(x, SAMPLE_RATE)
                    while (rec.isReady(s)) rec.decode(s)
                    val text = VoiceText.clean(rec.getResult(s).text)
                    // A streaming transducer doesn't revise what it has emitted: all of it is stable.
                    listener.onText(text, "")
                }
            } finally {
                ar.stop(); ar.release(); _level.value = 0f
            }
        }.apply { name = "voice-input"; start() }
        return true
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

    private fun stopRecording(): OnlineStream? {
        listening = false
        thread?.join()
        thread = null
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
        const val ASKED = "mic_asked"
        val requests = AtomicInteger()
    }
}
