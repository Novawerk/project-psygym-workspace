package io.novawerk.psygym

import java.io.File
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Kotlin's removeFirst() / removeLast() on a MutableList compile to Java's List methods of the
 * same name when compileSdk is 35+, and those exist only from Android 15 (API 35). Our minSdk is
 * 26, so on older phones they crash with NoSuchMethodError. The same goes for the rest of
 * Java 21's SequencedCollection methods (getFirst, getLast, addFirst, addLast, reversed).
 * Android lint doesn't look at commonMain, so this test scans the app's sources instead, with
 * or without a receiver (`list.removeLast()` and `removeLast()` inside `with(list)`). Use
 * removeAt(0) / removeAt(lastIndex), first() / last(), add(0, x) / add(x), asReversed().
 */
class NoApi35ListCallsTest {
    private val banned = Regex("""(?<![\w`])(removeFirst|removeLast|getFirst|getLast|addFirst|addLast|reversed)\s*\(""")

    // Declaring a function of that name is fine; calling one isn't.
    private val declaration = Regex("""\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(removeFirst|removeLast|getFirst|getLast|addFirst|addLast|reversed)\b""")

    @Test
    fun thePatternCatchesEveryForm() {
        listOf("list.removeLast()", "with(list) { removeLast() }", "xs.reversed()", "q.addFirst(1)", "a.getLast ()")
            .forEach { assertTrue(banned.containsMatchIn(it), it) }
        listOf("list.removeAt(list.lastIndex)", "xs.asReversed()", "removeLastItem()")
            .forEach { assertTrue(!banned.containsMatchIn(it), it) }
    }

    @Test
    fun appSourcesDontCallApi35ListMethods() {
        val roots = listOf("src/commonMain", "src/androidMain", "src/androidDebug", "src/androidRelease").map(::File)
        assertTrue(roots.first().isDirectory, "run from the module directory")
        val hits = roots.filter { it.isDirectory }
            .flatMap { root -> root.walkTopDown().filter { it.extension == "kt" }.toList() }
            .flatMap { file ->
                file.readLines().mapIndexedNotNull { i, line ->
                    val code = line.substringBefore("//")
                    "${file.path}:${i + 1}: ${line.trim()}".takeIf { banned.containsMatchIn(code) && !declaration.containsMatchIn(code) }
                }
            }
        assertTrue(hits.isEmpty(), "API 35 list calls:\n" + hits.joinToString("\n"))
    }
}
