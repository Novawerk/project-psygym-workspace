package io.novawerk.psygym.data.voice

import java.io.File

/** Release variant: hold to talk always listens to the microphone. See src/androidDebug. */
internal object VoiceTestAudio {
    @Suppress("UNUSED_PARAMETER")
    fun file(filesDir: File): File? = null
}
