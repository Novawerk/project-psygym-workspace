package io.novawerk.psygym.data.voice

import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** One file of a model, with the size and SHA-256 we expect. The hash is ours, never the server's. */
data class ModelFile(val name: String, val bytes: Long, val sha256: String)

/**
 * The Android model (ADR 0010): X-ASR 480 ms streaming, Chinese and English, with punctuation,
 * int8. The four files from the release tarball, as published; served from our own host.
 */
object XAsrModel {
    const val DIR = "x-asr-480ms-zh-en-punct-int8-2026-06-05"

    val files = listOf(
        ModelFile("encoder.int8.onnx", 155_278_641, "908596dcc137a73b95be908ca55e88caa1b3dbbe8027c171615f4b0609c5eb1e"),
        ModelFile("decoder.onnx", 11_309_084, "a1cbc9eac2d5e3fb6617a218c67ad6daaa7f4e0fd225f08b2c22ab0413c8c257"),
        ModelFile("joiner.int8.onnx", 2_581_422, "aedb7fa697b2ab43f20499826fff7c997eea7d67db77be97769aeeeb726e63b3"),
        ModelFile("tokens.txt", 58_806, "b818a60878b9aae978cbb8ad594acbd403d76d1af2e31ef4197c84e2dbdba27c"),
    )

    val totalBytes = files.sumOf { it.bytes }
}

/**
 * Downloads [files] from `<baseUrl>/<name>` into [dir]: one file at a time, resuming a
 * `.part` with an HTTP Range request, then checking size and SHA-256 before renaming it into
 * place. A file that fails the check is deleted, so a retry starts it clean.
 */
class ModelDownloader(
    private val baseUrl: String,
    private val dir: File,
    private val files: List<ModelFile>,
) {
    class Failed(message: String) : Exception(message)

    fun installed(): Boolean = files.all { File(dir, it.name).length() == it.bytes }

    /** Bytes on disk, finished files and parts. */
    fun bytesOnDisk(): Long = dir.listFiles()?.sumOf { it.length() } ?: 0L

    /** Blocking; call off the main thread. [progress] gets 0..1. Throws [Failed] or an IOException. */
    fun download(progress: (Float) -> Unit) {
        dir.mkdirs()
        val total = files.sumOf { it.bytes }.toFloat()
        var done = 0L
        for (f in files) {
            val target = File(dir, f.name)
            if (target.length() == f.bytes) {
                done += f.bytes
                continue
            }
            val part = File(dir, f.name + ".part")
            if (part.length() > f.bytes) part.delete()
            fetch(f, part) { got -> progress((done + got) / total) }
            if (part.length() != f.bytes || sha256(part) != f.sha256) {
                part.delete()
                throw Failed("${f.name}: size or checksum mismatch")
            }
            if (!part.renameTo(target)) throw Failed("${f.name}: rename failed")
            done += f.bytes
            progress(done / total)
        }
    }

    private fun fetch(f: ModelFile, part: File, onBytes: (Long) -> Unit) {
        var have = part.length()
        if (have == f.bytes) return
        val conn = URL("${baseUrl.trimEnd('/')}/${f.name}").openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000
        if (have > 0) conn.setRequestProperty("Range", "bytes=$have-")
        try {
            when (conn.responseCode) {
                HttpURLConnection.HTTP_PARTIAL -> Unit
                // The server ignored the Range: start the file over.
                HttpURLConnection.HTTP_OK -> { have = 0; part.delete() }
                else -> throw Failed("${f.name}: HTTP ${conn.responseCode}")
            }
            RandomAccessFile(part, "rw").use { out ->
                out.seek(have)
                conn.inputStream.use { input ->
                    val buf = ByteArray(64 * 1024)
                    var last = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        have += n
                        if (have - last >= 1 shl 20) { onBytes(have); last = have }
                    }
                }
            }
            onBytes(have)
        } finally {
            conn.disconnect()
        }
    }

    fun delete() {
        dir.deleteRecursively()
    }

    companion object {
        fun sha256(file: File): String {
            val md = MessageDigest.getInstance("SHA-256")
            FileInputStream(file).use { input ->
                val buf = ByteArray(1 shl 16)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    md.update(buf, 0, n)
                }
            }
            return md.digest().joinToString("") { "%02x".format(it) }
        }
    }
}
