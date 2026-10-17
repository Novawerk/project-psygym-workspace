package io.novawerk.psygym.data.voice

import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetSocketAddress
import java.nio.file.Files
import java.security.MessageDigest
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The speech model download against a local server: resume, checksum, cancel, Range answers. */
class ModelDownloaderTest {
    private val body = ByteArray(300_000) { (it % 251).toByte() }
    private val file = ModelFile("model.bin", body.size.toLong(), sha(body))
    private val dir: File = Files.createTempDirectory("asr").toFile().resolve("m")
    private val ranges = mutableListOf<String?>()

    /** [honourRange] false: always answers 200 with the whole file. [corrupt]: one byte wrong. */
    private fun server(honourRange: Boolean = true, corrupt: Boolean = false, badContentRange: Boolean = false): HttpServer =
        HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/model.bin") { ex ->
                val range = ex.requestHeaders.getFirst("Range")
                ranges += range
                val data = if (corrupt) body.copyOf().also { it[10] = (it[10] + 1).toByte() } else body
                val from = range?.removePrefix("bytes=")?.removeSuffix("-")?.toInt()
                if (honourRange && from != null) {
                    val start = if (badContentRange) from + 1 else from
                    ex.responseHeaders.add("Content-Range", "bytes $start-${data.size - 1}/${data.size}")
                    ex.sendResponseHeaders(206, (data.size - from).toLong())
                    ex.responseBody.use { it.write(data, from, data.size - from) }
                } else {
                    ex.sendResponseHeaders(200, data.size.toLong())
                    ex.responseBody.use { it.write(data) }
                }
            }
            start()
        }

    private var srv: HttpServer? = null
    private fun downloader(s: HttpServer) = ModelDownloader("http://127.0.0.1:${s.address.port}", dir, listOf(file)).also { srv = s }

    @AfterTest
    fun stop() {
        srv?.stop(0)
        dir.parentFile.deleteRecursively()
    }

    @Test
    fun downloadsChecksAndMarksInstalled() {
        val d = downloader(server())
        assertFalse(d.installed())
        d.download { }
        assertTrue(d.installed())
        assertTrue(File(dir, "model.bin").readBytes().contentEquals(body))
    }

    @Test
    fun resumesAPartWithRange() {
        dir.mkdirs()
        File(dir, "model.bin.part").writeBytes(body.copyOf(100_000))
        val d = downloader(server())
        d.download { }
        assertEquals(listOf<String?>("bytes=100000-"), ranges)
        assertTrue(d.installed())
    }

    @Test
    fun serverIgnoringRange_startsOver() {
        dir.mkdirs()
        File(dir, "model.bin.part").writeBytes(body.copyOf(100_000))
        val d = downloader(server(honourRange = false))
        d.download { }
        assertTrue(d.installed())
        assertTrue(File(dir, "model.bin").readBytes().contentEquals(body))
    }

    @Test
    fun wrongContentRange_failsWithoutKeepingBadBytes() {
        dir.mkdirs()
        File(dir, "model.bin.part").writeBytes(body.copyOf(100_000))
        val d = downloader(server(badContentRange = true))
        assertFailsWith<ModelDownloader.Failed> { d.download { } }
        assertFalse(d.installed())
        assertEquals(100_000, File(dir, "model.bin.part").length())
    }

    @Test
    fun checksumMismatch_deletesThePart() {
        val d = downloader(server(corrupt = true))
        assertFailsWith<ModelDownloader.Failed> { d.download { } }
        assertFalse(d.installed())
        assertFalse(File(dir, "model.bin.part").exists())
        assertFalse(File(dir, "model.bin").exists())
    }

    @Test
    fun cancelled_stopsAndKeepsThePartForLater() {
        val d = downloader(server())
        assertFailsWith<ModelDownloader.Cancelled> { d.download(cancelled = { true }) { } }
        assertFalse(d.installed())
    }

    @Test
    fun rightSizeWithoutTheMarker_isNotInstalled() {
        dir.mkdirs()
        File(dir, "model.bin").writeBytes(body)
        assertFalse(downloader(server()).installed())
    }

    private fun sha(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
}
