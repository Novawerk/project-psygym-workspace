package io.novawerk.voicespike

import com.k2fsa.sherpa.onnx.EndpointConfig
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineParaformerModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import com.k2fsa.sherpa.onnx.OnlineZipformer2CtcModelConfig
import java.io.File

/** The streaming candidates. [files] are the only files the app needs from each release tarball. */
enum class Candidate(val dir: String, val label: String, val files: List<String>) {
    XAsr480(
        "sherpa-onnx-x-asr-480ms-streaming-zipformer-transducer-zh-en-int8-2026-06-05", "X-ASR 480ms 中英",
        listOf("tokens.txt", "encoder.int8.onnx", "decoder.onnx", "joiner.int8.onnx"),
    ),
    XAsr160(
        "sherpa-onnx-x-asr-160ms-streaming-zipformer-transducer-zh-en-int8-2026-06-05", "X-ASR 160ms 中英",
        listOf("tokens.txt", "encoder.int8.onnx", "decoder.onnx", "joiner.int8.onnx"),
    ),
    SmallCtcZh(
        "sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01", "Zipformer small CTC 中文",
        listOf("tokens.txt", "model.int8.onnx"),
    ),
    ParaformerZhEn(
        "sherpa-onnx-streaming-paraformer-bilingual-zh-en", "Paraformer 中英",
        listOf("tokens.txt", "encoder.int8.onnx", "decoder.int8.onnx"),
    ),
    ;

    val url get() = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$dir.tar.bz2"

    fun folder(root: File) = File(root, "models/$dir")

    fun installed(root: File) = files.all { File(folder(root), it).isFile }

    fun sizeBytes(root: File) = files.sumOf { File(folder(root), it).length() }

    fun recognizer(root: File, threads: Int): OnlineRecognizer {
        val d = folder(root).absolutePath
        val model = when (this) {
            XAsr480, XAsr160 -> OnlineModelConfig(
                transducer = OnlineTransducerModelConfig("$d/encoder.int8.onnx", "$d/decoder.onnx", "$d/joiner.int8.onnx"),
            )
            SmallCtcZh -> OnlineModelConfig(zipformer2Ctc = OnlineZipformer2CtcModelConfig("$d/model.int8.onnx"))
            ParaformerZhEn -> OnlineModelConfig(paraformer = OnlineParaformerModelConfig("$d/encoder.int8.onnx", "$d/decoder.int8.onnx"))
        }.apply {
            tokens = "$d/tokens.txt"
            numThreads = threads
        }
        // Hold-to-talk: the user decides when an utterance ends, so no endpointing.
        return OnlineRecognizer(
            config = OnlineRecognizerConfig(
                featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
                modelConfig = model,
                endpointConfig = EndpointConfig(),
                enableEndpoint = false,
            ),
        )
    }
}

/** The reading test: client and counselor lines from content/cases and rubrics. */
object Sentences {
    val zh = listOf(
        "最近什么都不想做，早上起不来，觉得自己挺没用的。",
        "就，也没什么，就是不想动。",
        "也还好吧，可能是我自己的问题。",
        "说了好像也没什么用。",
        "有时候觉得，活着挺累的。",
        "最近老是睡不着，心慌，做什么都没意思。",
        "其实问题我都清楚，就是执行不下去。",
        "感受，我也说不上来，主要是事情太多。",
        "要是又出事，就全完了。",
        "他们肯定觉得我不行。",
        "听起来这几个月你一直很累，也很失望。",
        "你刚才说我又搞砸了，当时脑子里还闪过什么？",
        "我们今天先聊聊最困扰你的那件事，好吗？",
        "支持这个想法的证据是什么？不支持的呢？",
        "最近有没有想过伤害自己？",
        "你有没有想过结束自己的生命？",
        "我们一起来看看这里面的自动思维。",
        "这听起来像是一种认知歪曲，比如灾难化或者读心术。",
        "这周可以试着记录一下情绪和当时的想法。",
        "在一到十分里，你现在的焦虑大概是几分？",
    )
    val en = listOf(
        "Lately I don't feel like doing anything and I can't get out of bed.",
        "It's nothing really, I just don't want to move.",
        "It's fine, maybe it's just my own problem.",
        "I don't think talking about it would help.",
        "Sometimes I feel like living is just exhausting.",
        "I keep waking up at four and can't fall back asleep.",
        "My heart races before every meeting.",
        "If something goes wrong again, it's all over.",
        "They must think I'm not good enough.",
        "It sounds like you've been tired and disappointed for months.",
        "What went through your mind at that moment?",
        "Let's start with the thing that bothers you most today, okay?",
        "What is the evidence for that thought, and what is the evidence against it?",
        "Have you had any thoughts of hurting yourself recently?",
        "Have you ever thought about ending your life?",
        "Do you have a plan?",
        "Let's look at the automatic thoughts behind that feeling.",
        "That sounds like a cognitive distortion, such as catastrophizing or mind reading.",
        "This week, could you write down your mood and what you were thinking?",
        "On a scale from one to ten, how anxious do you feel right now?",
    )
    val all = zh.map { "zh" to it } + en.map { "en" to it }
}

/** Character error rate for Chinese, word error rate for English. */
object ErrorRate {
    private val num = mapOf("1" to "one", "10" to "ten", "4" to "four")

    fun units(lang: String, s: String): List<String> =
        if (lang == "zh") s.filter { it.isLetterOrDigit() }.map { it.toString() }
        else s.lowercase().replace('▁', ' ').replace(Regex("[^a-z0-9' ]"), " ").split(' ').filter { it.isNotEmpty() }.map { num[it] ?: it }

    fun edits(r: List<String>, h: List<String>): Int {
        val d = IntArray(h.size + 1) { it }
        for (i in 1..r.size) {
            var p = d[0]
            d[0] = i
            for (j in 1..h.size) {
                val t = d[j]
                d[j] = minOf(d[j] + 1, d[j - 1] + 1, p + if (r[i - 1] == h[j - 1]) 0 else 1)
                p = t
            }
        }
        return d[h.size]
    }
}
