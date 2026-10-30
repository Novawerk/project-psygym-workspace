package io.novawerk.psygym.data.voice

import java.io.File

/**
 * Debug builds only: with `files/voice-test.wav` (16 kHz mono PCM) on the phone, hold to talk
 * hears that file instead of the microphone. For emulators, which have no microphone, and for
 * screenshots. The release variant (src/androidRelease) always answers null.
 */
internal object VoiceTestAudio {
    fun file(filesDir: File): File? = File(filesDir, "voice-test.wav").takeIf { it.isFile }

    /** With `files/voice-call-test.txt`, a voice session sends these lines as the trainee's turns. */
    fun callLines(filesDir: File): List<String> =
        File(filesDir, "voice-call-test.txt").takeIf { it.isFile }?.readLines()?.filter { it.isNotBlank() }.orEmpty()
}
