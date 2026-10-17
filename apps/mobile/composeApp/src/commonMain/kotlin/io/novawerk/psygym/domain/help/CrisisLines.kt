package io.novawerk.psygym.domain.help

import io.novawerk.psygym.domain.model.LocalizedText

// Crisis lines on the "Need help?" page (docs/safety.md §5). Checked against the official
// sources listed there on 2026-10-17; check again every six months. Change numbers only
// together with safety.md.

/** One number to call. [dial] is what goes after `tel:`; [display] is how it's written. */
data class CrisisLine(
    val name: LocalizedText,
    val display: String,
    val dial: String,
    val note: LocalizedText? = null,
)

/** Emergency services: shown as a short row ("Ambulance 120 · Police 110"). */
data class EmergencyNumber(val label: LocalizedText, val number: String)

/** A place, the ISO 3166 country codes it covers, its crisis lines and emergency numbers. */
data class CrisisRegion(
    val id: String,
    val countries: Set<String>,
    val name: LocalizedText,
    val lines: List<CrisisLine>,
    val emergency: List<EmergencyNumber>,
)

object CrisisLines {
    // Last checked 2026-10-17 (also in the help_checked string).

    private fun t(zh: String, en: String) = LocalizedText(zh, en)

    val regions: List<CrisisRegion> = listOf(
        CrisisRegion(
            id = "cn",
            countries = setOf("CN"),
            name = t("中国大陆", "Mainland China"),
            lines = listOf(
                CrisisLine(t("全国心理援助热线", "National mental health helpline"), "12356", "12356", t("各地开通时段不同", "Hours vary by region")),
                CrisisLine(t("北京心理援助热线", "Beijing Psychological Aid Hotline"), "010-82951332", "01082951332", t("24 小时", "24 hours")),
            ),
            emergency = listOf(EmergencyNumber(t("急救", "Ambulance"), "120"), EmergencyNumber(t("报警", "Police"), "110")),
        ),
        CrisisRegion(
            id = "hk",
            countries = setOf("HK"),
            name = t("香港", "Hong Kong"),
            lines = listOf(
                CrisisLine(t("精神健康支援热线 18111", "Mental Health Support Hotline 18111"), "18111", "18111", t("政府热线，24 小时", "Government hotline, 24 hours")),
                CrisisLine(t("撒瑪利亞會", "The Samaritans Hong Kong"), "2896 0000", "28960000", t("24 小时，多语言", "24 hours, several languages")),
            ),
            emergency = listOf(EmergencyNumber(t("紧急", "Emergency"), "999")),
        ),
        CrisisRegion(
            id = "tw",
            countries = setOf("TW"),
            name = t("台湾", "Taiwan"),
            lines = listOf(
                CrisisLine(t("安心專線", "Mental health hotline (1925)"), "1925", "1925", t("24 小时，免费", "24 hours, free")),
                CrisisLine(t("生命線", "Lifeline Taiwan"), "1995", "1995"),
            ),
            emergency = listOf(EmergencyNumber(t("急救", "Ambulance"), "119"), EmergencyNumber(t("报警", "Police"), "110")),
        ),
        CrisisRegion(
            id = "de",
            countries = setOf("DE"),
            name = t("德国", "Germany"),
            lines = listOf(
                CrisisLine(t("TelefonSeelsorge", "TelefonSeelsorge"), "0800 111 0 111", "08001110111", t("24 小时，免费", "24/7, free")),
                CrisisLine(t("TelefonSeelsorge", "TelefonSeelsorge"), "0800 111 0 222", "08001110222", t("24 小时，免费", "24/7, free")),
                CrisisLine(t("TelefonSeelsorge", "TelefonSeelsorge"), "116 123", "116123", t("24 小时，免费", "24/7, free")),
            ),
            emergency = listOf(EmergencyNumber(t("急救", "Emergency"), "112"), EmergencyNumber(t("报警", "Police"), "110")),
        ),
        CrisisRegion(
            id = "us",
            countries = setOf("US"),
            name = t("美国", "United States"),
            lines = listOf(
                CrisisLine(
                    t("988 自杀与危机热线", "988 Suicide & Crisis Lifeline"), "988", "988",
                    t("电话或短信，24 小时，免费；西班牙语按 2，或发短信 AYUDA", "Call or text, 24/7, free. Spanish: press 2, or text AYUDA"),
                ),
            ),
            emergency = listOf(EmergencyNumber(t("紧急", "Emergency"), "911")),
        ),
        CrisisRegion(
            id = "gb",
            countries = setOf("GB"),
            name = t("英国", "United Kingdom"),
            lines = listOf(
                CrisisLine(t("Samaritans", "Samaritans"), "116 123", "116123", t("24 小时，免费", "24 hours, free")),
                CrisisLine(t("NHS 111", "NHS 111"), "111", "111", t("选择心理健康选项", "Choose the mental health option")),
            ),
            emergency = listOf(EmergencyNumber(t("紧急", "Emergency"), "999")),
        ),
    )

    /** The user's region first (by the phone's region setting), the rest in the order above. */
    fun ordered(country: String?): Pair<CrisisRegion?, List<CrisisRegion>> {
        val code = country?.uppercase()
        val own = regions.firstOrNull { code != null && code in it.countries }
        return own to regions.filter { it != own }
    }
}
