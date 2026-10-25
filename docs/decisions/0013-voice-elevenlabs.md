# 0013 — Voice sessions through an ElevenLabs agent

Date: 2026-10-25. Status: **accepted** (the user, 2026-10-25). Backend done; the app side is next.

## Decision

The trainee can talk to the AI client out loud, in real time. An **ElevenLabs agent** listens and
speaks. **The words still come from our backend:** the agent's LLM is set to "Custom LLM", pointing
at `POST /voice/llm/chat/completions`.

```
phone ──audio──▶ ElevenLabs agent ──OpenAI chat request──▶ our /voice/llm ──▶ model vendor
      ◀─audio──   (speech to text,  ◀──SSE text + end_call──   (client prompt, case,
                   text to speech)                               end_session, judge)
```

- **Same client as `/chat`.** Same prompt (`apps/api/prompts/client.md`) plus one voice note,
  same case, same `end_session` and `END_SESSION_JUDGE`. When the client ends the session, we
  answer with ElevenLabs' `end_call` tool after the closing line: it speaks the line, then hangs
  up. The agent's own system prompt is ignored except for the `{{psygym}}` marker.
- **Stateless.** ElevenLabs sends the whole conversation every turn. We store nothing and log no
  text, as for `/chat`. Counts are the same as `/chat` (`chat_turn`, `session_started`,
  `session_ended_by_client`).
- **No key on the phone.** The agent is private. The app asks `POST /voice/session` (behind the
  usual gate) for a short-lived conversation token, and gets back what to pass when it starts the
  call: `dynamicVariables.psygym` and `extraBody` (case and language).
- **ElevenLabs authenticates to us** with `VOICE_LLM_SECRET` (the agent's custom-LLM API key).
- **Off by default.** Without `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` and `VOICE_LLM_SECRET`,
  both routes answer 404.
- **The supervisor report** stays text: the app keeps the transcript ElevenLabs sends it
  (`onMessage`) and calls `/supervision` as today.

## Agent settings (in the ElevenLabs dashboard)

- LLM: Custom LLM. Server URL `https://<api host>/voice/llm` (or `…/voice/llm/v1`), API key
  secret = `VOICE_LLM_SECRET`.
- System prompt: only `{{psygym}}`. First message: empty (the trainee speaks first).
- System tools: `end_call` on; nothing else.
- Privacy: retention 0 days, audio saving off. Zero Retention Mode if the plan allows it
  (enterprise).
- Authentication on (private agent).

## Why

- Voice practice is closer to a real session than typing. Hold-to-talk (ADR 0010) helps typing,
  but turn-taking, pauses and interruptions only exist in real time.
- Keeping our backend as the brain means one client, one set of safety rules, one place to fix
  them. ElevenLabs' built-in LLM would mean a second copy of the prompt and the harm logic.

## Consequences

- **This reverses part of ADR 0010 and `safety.md` §1 for voice sessions:** the trainee's audio
  goes to ElevenLabs (a US company) to be transcribed and the reply is synthesised there. Typing
  and hold-to-talk stay as they are. Before the app ships voice, update `safety.md`, the privacy
  policy, the store privacy labels and review notes, and the in-app notice before a voice session.
- Without Zero Retention Mode, ElevenLabs keeps logs we don't control even at 0-day retention.
  Check the plan and the data processing terms before real users.
- Latency adds up: speech to text, our backend, the model vendor, text to speech. Measure it in
  the spike before deciding on the UI.
- Cost per minute: ElevenLabs bills voice minutes on top of our model tokens.
- Long sessions: we keep the last 80 messages (`MAX_MESSAGES`), like `/chat`.
- Not verified against the live service yet (no key in the dev environment): the exact request
  ElevenLabs sends (`elevenlabs_extra_body` or only the system prompt), the server URL it calls,
  and the Kotlin/Swift SDK option names for dynamic variables. The code accepts both ways of
  passing the case.
- Next: the app side (Kotlin Multiplatform: `io.elevenlabs:elevenlabs-android` on Android, the
  ElevenLabs Swift SDK on iOS, behind one interface).
