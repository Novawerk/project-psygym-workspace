package io.novawerk.psygym.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Shapes from docs/api-contract.md. Keep them in step with the contract.

@Serializable
enum class ApiLocale {
    @SerialName("zh") Zh,
    @SerialName("en") En,
    ;

    companion object {
        fun fromTag(tag: String): ApiLocale = if (tag.startsWith("zh")) Zh else En
    }
}

@Serializable
enum class Role {
    /** The trainee. */
    @SerialName("counselor") Counselor,

    /** The AI. */
    @SerialName("client") Client,
}

@Serializable
data class Message(val role: Role, val text: String)

@Serializable
data class LocalizedText(val zh: String, val en: String) {
    fun get(locale: ApiLocale): String = when (locale) {
        ApiLocale.Zh -> zh
        ApiLocale.En -> en
    }
}

@Serializable
data class CaseSummary(
    val id: String,
    val school: String,
    val title: LocalizedText,
    val summary: LocalizedText,
    // Optional: any of these may be missing; screens fall back (docs/product/screens.md).
    val tags: List<LocalizedText> = emptyList(),
    val difficulty: Difficulty? = null,
    val estimatedMinutes: Int? = null,
    val clientAlias: LocalizedText? = null,
    val clientIntro: LocalizedText? = null,
    val practiceFocus: List<LocalizedText> = emptyList(),
    val contentNotes: LocalizedText? = null,
)

@Serializable
enum class Difficulty {
    @SerialName("intro") Intro,
    @SerialName("medium") Medium,
    @SerialName("hard") Hard,
}

@Serializable
data class CasesResponse(val cases: List<CaseSummary>)

/** Body of `POST /chat` and `POST /supervision`. */
@Serializable
data class TurnRequest(
    val caseId: String,
    val locale: ApiLocale,
    val messages: List<Message>,
    /** `/supervision` only: the session length in whole seconds, 0–7200. Left out when null. */
    val durationSec: Int? = null,
    /** `/supervision` only: "live" for mid-session notes; left out for the full report. */
    val mode: String? = null,
)

/** The session length the contract accepts as `durationSec`: whole seconds, at most two hours. */
fun durationSec(duration: kotlin.time.Duration): Int = duration.inWholeSeconds.coerceIn(0, 7200).toInt()

object ContractLimits {
    const val MAX_MESSAGE_CHARS = 2000
    const val MAX_MESSAGES = 80
}
