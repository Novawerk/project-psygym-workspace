package io.novawerk.voicespike

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Debug
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Throwaway: compares on-device streaming models for hold-to-talk. Not product code. */
class MainActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val root by lazy { getExternalFilesDir(null)!! }
    private lateinit var picker: Spinner
    private lateinit var status: TextView
    private lateinit var prompt: TextView
    private lateinit var live: TextView
    private lateinit var log: TextView
    private lateinit var hold: Button

    private var candidate = Candidate.XAsr480
    private var recognizer: OnlineRecognizer? = null
    private var engine: Engine? = null
    private var loadMs = 0L

    // Reading test state.
    private var reading = -1
    private val results = JSONArray()
    private var chargeAtStart = 0L
    private var testStartedAt = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad * 2, pad, pad) }
        picker = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, Candidate.entries.map { it.label })
        }
        val row = LinearLayout(this).apply {
            addView(button("下载") { download() })
            addView(button("加载") { load() })
            addView(button("朗读测试") { startReading() })
            addView(button("文件测试") { runFiles() })
        }
        status = TextView(this)
        prompt = TextView(this).apply { textSize = 20f; setPadding(0, pad, 0, pad) }
        live = TextView(this).apply { textSize = 18f; setTextColor(Color.DKGRAY); minLines = 3 }
        hold = Button(this).apply {
            text = "按住说话"; textSize = 22f; minHeight = pad * 6
            setOnTouchListener(::onHold)
        }
        log = TextView(this).apply { textSize = 12f; setTextIsSelectable(true) }
        col.addView(picker); col.addView(row); col.addView(status); col.addView(prompt); col.addView(live); col.addView(hold)
        col.addView(ScrollView(this).apply { addView(log) }, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(col)
        picker.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
                candidate = Candidate.entries[pos]; showStatus()
            }
            override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }
        showStatus()
    }

    private fun button(t: String, f: () -> Unit) = Button(this).apply { text = t; textSize = 12f; setOnClickListener { f() } }

    private fun showStatus(extra: String = "") {
        val inst = candidate.installed(root)
        status.text = buildString {
            append(if (inst) "已安装 ${candidate.sizeBytes(root) / 1_000_000} MB" else "未下载")
            if (recognizer != null) append(" · 已加载 ${loadMs} ms · PSS ${pssMb()} MB")
            append("\n${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} · ${Build.SUPPORTED_ABIS.first()}")
            if (extra.isNotEmpty()) append("\n$extra")
        }
    }

    private fun pssMb() = Debug.getPss() / 1024

    private fun out(s: String) {
        log.append(s + "\n")
        Log.i("VoiceSpike", s)
    }

    private fun download() {
        val c = candidate
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val conn = URL(c.url).openConnection() as HttpURLConnection
                    conn.instanceFollowRedirects = true
                    val total = conn.contentLengthLong
                    var read = 0L
                    val counting = object : java.io.FilterInputStream(conn.inputStream.buffered(1 shl 16)) {
                        override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also {
                            if (it > 0) { read += it; if (read % (8 shl 20) < it) runOnUiThread { showStatus("下载 ${read shr 20} / ${total shr 20} MB") } }
                        }
                    }
                    c.folder(root).mkdirs()
                    TarArchiveInputStream(BZip2CompressorInputStream(counting)).use { tar ->
                        while (true) {
                            val e = tar.nextEntry ?: break
                            val name = e.name.substringAfterLast('/')
                            if (!e.isDirectory && name in c.files) File(c.folder(root), name).outputStream().use { tar.copyTo(it) }
                        }
                    }
                }
                out("下载完成 ${c.label}")
            } catch (e: Exception) {
                out("下载失败：$e")
            }
            showStatus()
        }
    }

    private fun load(then: (() -> Unit)? = null) {
        if (!candidate.installed(root)) { out("先下载或 adb push 模型"); return }
        val c = candidate
        scope.launch {
            recognizer?.release(); recognizer = null; engine = null
            val t = SystemClock.elapsedRealtime()
            val r = withContext(Dispatchers.Default) { c.recognizer(root, threads = 2) }
            loadMs = SystemClock.elapsedRealtime() - t
            recognizer = r; engine = Engine(r)
            out("加载 ${c.label}：$loadMs ms，PSS ${pssMb()} MB")
            showStatus()
            then?.invoke()
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun onHold(v: View, e: MotionEvent): Boolean {
        val eng = engine ?: run { if (e.action == MotionEvent.ACTION_DOWN) out("先加载模型"); return true }
        when (e.action) {
            MotionEvent.ACTION_DOWN -> {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return true
                hold.text = "松开结束"; live.text = ""
                eng.start { t -> runOnUiThread { live.text = t } }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                hold.text = "按住说话"
                scope.launch {
                    val u = withContext(Dispatchers.Default) { eng.stop() }
                    live.text = u.text
                    record(u)
                }
            }
        }
        return true
    }

    private fun record(u: Utterance) {
        val base = "首字 ${u.firstPartialMs ?: "-"} ms（按下起 ${u.pressToPartialMs ?: "-"}）· 松手到全文 ${u.releaseToFinalMs} ms · CPU ${"%.0f".format(u.cpuPercent)}% · PSS ${pssMb()} MB"
        if (reading !in Sentences.all.indices) { out("${u.text}\n  $base"); return }
        val (lang, ref) = Sentences.all[reading]
        val r = ErrorRate.units(lang, ref)
        val err = ErrorRate.edits(r, ErrorRate.units(lang, u.text))
        results.put(utteranceJson(u).put("lang", lang).put("ref", ref).put("errors", err).put("units", r.size))
        out("${reading + 1}. ${u.text}\n  错 $err/${r.size} · $base")
        reading++
        if (reading < Sentences.all.size) showPrompt() else finishReading("reading")
    }

    private fun utteranceJson(u: Utterance) = JSONObject()
        .put("hyp", u.text).put("audioMs", u.audioMs).put("firstPartialMs", u.firstPartialMs ?: JSONObject.NULL)
        .put("pressToPartialMs", u.pressToPartialMs ?: JSONObject.NULL).put("releaseToFinalMs", u.releaseToFinalMs)
        .put("cpuPercent", u.cpuPercent).put("pssMb", pssMb())

    private fun startReading() {
        load {
            reading = 0
            while (results.length() > 0) results.remove(0)
            chargeAtStart = charge(); testStartedAt = SystemClock.elapsedRealtime()
            showPrompt()
        }
    }

    private fun showPrompt() {
        prompt.text = "${reading + 1}/${Sentences.all.size}  ${Sentences.all[reading].second}"
    }

    private fun charge() = (getSystemService(BATTERY_SERVICE) as BatteryManager).getLongProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)

    /** Writes the run to files/results-*.json and prints the summary. */
    private fun finishReading(kind: String) {
        reading = -1; prompt.text = ""
        val sum = JSONObject()
        for (lang in listOf("zh", "en")) {
            var e = 0; var n = 0
            val first = mutableListOf<Long>(); val fin = mutableListOf<Long>(); val cpu = mutableListOf<Double>()
            for (i in 0 until results.length()) {
                val o = results.getJSONObject(i)
                if (o.getString("lang") != lang) continue
                e += o.getInt("errors"); n += o.getInt("units")
                if (!o.isNull("firstPartialMs")) first += o.getLong("firstPartialMs")
                fin += o.getLong("releaseToFinalMs"); cpu += o.getDouble("cpuPercent")
            }
            if (n == 0) continue
            sum.put(lang, JSONObject().put("errorRate", 100.0 * e / n).put("firstPartialMedianMs", median(first))
                .put("releaseToFinalMedianMs", median(fin)).put("cpuMeanPercent", cpu.average()))
        }
        val mins = (SystemClock.elapsedRealtime() - testStartedAt) / 60000.0
        val doc = JSONObject()
            .put("kind", kind).put("model", candidate.dir).put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("android", Build.VERSION.RELEASE).put("abi", Build.SUPPORTED_ABIS.first())
            .put("loadMs", loadMs).put("modelBytes", candidate.sizeBytes(root)).put("pssMb", pssMb())
            .put("minutes", mins).put("chargeUsed_uAh", chargeAtStart - charge())
            .put("summary", sum).put("utterances", results)
        val f = File(root, "results-$kind-${candidate.name}-${System.currentTimeMillis()}.json")
        f.writeText(doc.toString(2))
        out("== ${candidate.label} $kind\n${sum.toString(2)}\n电量 ${chargeAtStart - charge()} µAh / ${"%.1f".format(mins)} 分钟\n已存 ${f.name}")
    }

    private fun median(x: List<Long>) = if (x.isEmpty()) JSONObject.NULL else x.sorted()[x.size / 2]

    /** Runs files/wav/{zh,en}-N-*.wav through the model in real time (no microphone). */
    private fun runFiles() {
        val wavs = File(root, "wav").listFiles { f -> f.name.endsWith(".wav") }?.sortedBy { it.name } ?: emptyList()
        if (wavs.isEmpty()) { out("没有 files/wav/*.wav"); return }
        load {
            val eng = engine ?: return@load
            while (results.length() > 0) results.remove(0)
            chargeAtStart = charge(); testStartedAt = SystemClock.elapsedRealtime()
            scope.launch {
                for (w in wavs) {
                    val parts = w.nameWithoutExtension.split('-')
                    val lang = parts[0]
                    val ref = (if (lang == "zh") Sentences.zh else Sentences.en)[parts[1].toInt() - 1]
                    val u = withContext(Dispatchers.Default) { eng.runFile(w) }
                    val r = ErrorRate.units(lang, ref)
                    results.put(utteranceJson(u).put("file", w.name).put("lang", lang).put("ref", ref)
                        .put("errors", ErrorRate.edits(r, ErrorRate.units(lang, u.text))).put("units", r.size))
                    live.text = "${w.name}: ${u.text}"
                }
                finishReading("files")
            }
        }
    }

    override fun onDestroy() {
        recognizer?.release()
        super.onDestroy()
    }
}
