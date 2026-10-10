package io.novawerk.psygym.ui

import io.novawerk.psygym.ui.components.avatarLetter
import io.novawerk.psygym.ui.pages.history.nextPractice
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SmallRulesTest {
    @Test
    fun avatarLetterFollowsTheScript() {
        assertEquals("林", avatarLetter("小林"))
        assertEquals("杰", avatarLetter("阿杰"))
        assertEquals("L", avatarLetter("Lin"))
        assertEquals("J", avatarLetter("jie"))
        assertEquals("É", avatarLetter("émile"))
        assertEquals("А", avatarLetter("анна"))
    }

    @Test
    fun nextPracticeTakesTheFirstItemOfThatSection() {
        val zh = "## 做得好的地方\n\n- 开放\n\n## 下次练什么\n\n1. 用苏格拉底式提问\n2. 设定议程\n"
        assertEquals("用苏格拉底式提问", nextPractice(zh))
        val en = "## What went well\n- open\n## What to practise next\n- **Set an agenda** together\n"
        assertEquals("Set an agenda together", nextPractice(en))
        assertNull(nextPractice("## What went well\n- open"))
        assertNull(nextPractice(""))
    }
}
