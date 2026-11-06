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
    /** How many sessions the case offers (docs/decisions/0014). Servers before it leave it out: one. */
    val sessions: Int = 1,
    /** Public notes for follow-up sessions, by session number. */
    val followUps: List<FollowUp> = emptyList(),
) {
    fun followUp(number: Int): FollowUp? = followUps.firstOrNull { it.session == number }
}

/** What the trainee sees before follow-up session [session] (2…6). */
@Serializable
data class FollowUp(
    val session: Int,
    val clientIntro: LocalizedText? = null,
    val practiceFocus: List<LocalizedText> = emptyList(),
)

/** A note on one earlier session: what `POST /session-summary` wrote, kept with the history. */
@Serializable
data class PreviousSession(val number: Int, val summary: String)

/** Which session this is, and the notes on the ones before (oldest first). Left out for a first session. */
@Serializable
data class SessionInfo(val number: Int, val previous: List<PreviousSession> = emptyList()) {
    companion object {
        /** The contract's limits: at most 5 notes, each at most 1,200 characters. */
        const val MAX_PREVIOUS = 5
        const val MAX_SUMMARY_CHARS = 1200
    }
}

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
    /** A follow-up session (docs/decisions/0014); left out for a first session. */
    val session: SessionInfo? = null,
)

@Serializable
data class SummaryResponse(val summary: String)

/** The session length the contract accepts as `durationSec`: whole seconds, at most two hours. */
fun durationSec(duration: kotlin.time.Duration): Int = duration.inWholeSeconds.coerceIn(0, 7200).toInt()

object ContractLimits {
    const val MAX_MESSAGE_CHARS = 2000
    const val MAX_MESSAGES = 80
}
