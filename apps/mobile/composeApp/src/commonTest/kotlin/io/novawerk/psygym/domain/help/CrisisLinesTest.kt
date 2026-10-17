package io.novawerk.psygym.domain.help

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CrisisLinesTest {
    @Test
    fun ownRegionFirst_theRestInOrder() {
        val (own, others) = CrisisLines.ordered("de")
        assertEquals("de", own?.id)
        assertEquals(listOf("cn", "hk", "tw", "us", "gb"), others.map { it.id })
    }

    @Test
    fun unknownOrMissingRegion_noOwnRegion_allListed() {
        for (code in listOf("FR", null, "")) {
            val (own, others) = CrisisLines.ordered(code)
            assertNull(own)
            assertEquals(6, others.size)
        }
    }

    @Test
    fun everyNumberDials() {
        for (r in CrisisLines.regions) {
            assertTrue(r.lines.isNotEmpty() && r.emergency.isNotEmpty(), r.id)
            for (l in r.lines) {
                assertTrue(l.dial.all { it in '0'..'9' }, "${r.id} ${l.display}")
                assertEquals(l.display.filter { it in '0'..'9' }, l.dial, "${r.id}: display and dial differ")
            }
            for (e in r.emergency) assertTrue(e.number.all { it in '0'..'9' }, "${r.id} ${e.number}")
        }
    }
}
