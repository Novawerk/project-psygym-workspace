package io.novawerk.psygym.domain.practice

import io.novawerk.psygym.di.AppScope
import io.novawerk.psygym.domain.model.CaseSummary
import io.novawerk.psygym.domain.model.Message
import me.tatarka.inject.annotations.Inject

/**
 * The practice in progress, held in memory only so the supervision screen can read the
 * transcript. Never written to disk: simulated sessions only, nothing kept.
 */
@AppScope
@Inject
class PracticeSession {
    var case: CaseSummary? = null
        private set
    var transcript: List<Message> = emptyList()
        private set

    fun start(case: CaseSummary) {
        this.case = case
        transcript = emptyList()
    }

    fun update(messages: List<Message>) {
        transcript = messages
    }

    fun clear() {
        case = null
        transcript = emptyList()
    }
}
