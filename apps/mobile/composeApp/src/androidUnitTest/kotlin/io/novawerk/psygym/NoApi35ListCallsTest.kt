package io.novawerk.psygym

import java.io.File
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Kotlin's removeFirst() / removeLast() on a MutableList compile to Java's List methods of the
 * same name when compileSdk is 35+, and those exist only from Android 15 (API 35). Our minSdk is
 * 26, so on older phones they crash with NoSuchMethodError. Android lint doesn't look at
 * commonMain, so this test scans the app's sources instead. Use removeAt(0) /
 * removeAt(lastIndex), first() / last().
 */
class NoApi35ListCallsTest {
    private val banned = Regex("""\.(removeFirst|removeLast|getFirst|getLast)\(\)""")

    @Test
    fun appSourcesDontCallApi35ListMethods() {
        val roots = listOf("src/commonMain", "src/androidMain", "src/androidDebug", "src/androidRelease").map(::File)
        assertTrue(roots.first().isDirectory, "run from the module directory")
        val hits = roots.filter { it.isDirectory }
            .flatMap { root -> root.walkTopDown().filter { it.extension == "kt" }.toList() }
            .flatMap { file ->
                file.readLines().mapIndexedNotNull { i, line ->
                    "${file.path}:${i + 1}: ${line.trim()}".takeIf { banned.containsMatchIn(line) && !line.trim().startsWith("//") }
                }
            }
        assertTrue(hits.isEmpty(), "API 35 list calls:\n" + hits.joinToString("\n"))
    }
}
