package io.novawerk.psygym.data.voice

import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertNull

/** Release builds never take test audio, even when the file is there. */
class VoiceTestAudioReleaseTest {
    @Test
    fun releaseIgnoresTheTestFile() {
        val dir = Files.createTempDirectory("files").toFile()
        dir.resolve("voice-test.wav").writeBytes(ByteArray(64))
        assertNull(VoiceTestAudio.file(dir))
    }
}
