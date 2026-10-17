package io.novawerk.voicespike

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process
import android.os.SystemClock
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineStream
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/** One utterance, measured. Times in ms. */
data class Utterance(
    val text: String,
    val audioMs: Long,
    /** Speech onset (first loud 100 ms block) to the first non-empty partial. */
    val firstPartialMs: Long?,
    /** Button down to the first non-empty partial. */
    val pressToPartialMs: Long?,
    /** Button up to the final text. */
    val releaseToFinalMs: Long,
    /** CPU time this process used, as a share of one core, while the utterance ran. */
    val cpuPercent: Double,
)

/**
 * Hold-to-talk on top of one streaming recognizer: [start] on press, [stop] on release.
 * Audio never leaves the phone and is never written to disk.
 */
class Engine(private val rec: OnlineRecognizer) {
    private var stream: OnlineStream? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    private var pressAt = 0L
    private var onsetAt = 0L
    private var firstAt = 0L
    private var cpuAt = 0L
    private var samples = 0L

    @SuppressLint("MissingPermission")
    fun start(onPartial: (String) -> Unit) {
        val s = rec.createStream()
        stream = s
        pressAt = SystemClock.elapsedRealtime(); onsetAt = 0; firstAt = 0; samples = 0
        cpuAt = Process.getElapsedCpuTime()
        running = true
        val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val ar = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, 3200 * 2))
        thread = Thread {
            val buf = ShortArray(1600) // 100 ms
            ar.startRecording()
            try {
                while (running) {
                    val n = ar.read(buf, 0, buf.size)
                    if (n <= 0) continue
                    feed(FloatArray(n) { buf[it] / 32768f }, onPartial)
                }
            } finally {
                ar.stop(); ar.release()
            }
        }.also { it.start() }
    }

    /** Release: flush with 1.5 s of silence (the model's right context), finish, read the final text. */
    fun stop(): Utterance {
        val up = SystemClock.elapsedRealtime()
        running = false
        thread?.join()
        val s = stream!!
        s.acceptWaveform(FloatArray(24000), 16000)
        s.inputFinished()
        while (rec.isReady(s)) rec.decode(s)
        val text = rec.getResult(s).text
        val end = SystemClock.elapsedRealtime()
        s.release(); stream = null
        return Utterance(
            text = text,
            audioMs = samples / 16,
            firstPartialMs = if (firstAt > 0 && onsetAt > 0) firstAt - onsetAt else null,
            pressToPartialMs = if (firstAt > 0) firstAt - pressAt else null,
            releaseToFinalMs = end - up,
            cpuPercent = 100.0 * (Process.getElapsedCpuTime() - cpuAt) / maxOf(1, end - pressAt),
        )
    }

    private fun feed(x: FloatArray, onPartial: (String) -> Unit) {
        val s = stream ?: return
        samples += x.size
        if (onsetAt == 0L && rms(x) > 0.02f) onsetAt = SystemClock.elapsedRealtime()
        s.acceptWaveform(x, 16000)
        while (rec.isReady(s)) rec.decode(s)
        val t = rec.getResult(s).text
        if (t.isNotBlank()) {
            if (firstAt == 0L) firstAt = SystemClock.elapsedRealtime()
            onPartial(t)
        }
    }

    /** Same as hold-to-talk, but from a 16 kHz mono wav, paced in real time. */
    fun runFile(f: File): Utterance {
        val x = readWav(f)
        val s = rec.createStream()
        stream = s
        pressAt = SystemClock.elapsedRealtime(); onsetAt = 0; firstAt = 0; samples = 0
        cpuAt = Process.getElapsedCpuTime()
        var i = 0
        while (i < x.size) {
            val chunk = x.copyOfRange(i, minOf(i + 1600, x.size))
            val t0 = SystemClock.elapsedRealtime()
            feed(chunk, {})
            i += chunk.size
            val wait = 100 - (SystemClock.elapsedRealtime() - t0)
            if (wait > 0) Thread.sleep(wait)
        }
        return stop()
    }

    private fun rms(x: FloatArray): Float {
        var e = 0.0
        for (v in x) e += v * v
        return sqrt(e / x.size).toFloat()
    }

    private fun readWav(f: File): FloatArray {
        RandomAccessFile(f, "r").use { r ->
            val b = ByteArray(r.length().toInt()); r.readFully(b)
            // Find the "data" chunk.
            var p = 12
            while (p + 8 <= b.size) {
                val id = String(b, p, 4)
                val len = ByteBuffer.wrap(b, p + 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
                if (id == "data") {
                    val sb = ByteBuffer.wrap(b, p + 8, minOf(len, b.size - p - 8)).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
                    return FloatArray(sb.remaining()) { sb.get(it) / 32768f }
                }
                p += 8 + len
            }
        }
        return FloatArray(0)
    }
}
