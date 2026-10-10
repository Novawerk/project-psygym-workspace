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
)

@Serializable
data class CasesResponse(val cases: List<CaseSummary>)

/** Body of `POST /chat` and `POST /supervision`. */
@Serializable
data class TurnRequest(
    val caseId: String,
    val locale: ApiLocale,
    val messages: List<Message>,
)

object ContractLimits {
    const val MAX_MESSAGE_CHARS = 2000
    const val MAX_MESSAGES = 80
}
