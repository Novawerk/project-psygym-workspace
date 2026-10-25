# 0013 — Real-time voice sessions use a vendor's speech-to-speech model

Date: 2026-10-25. Status: **proposed**. The direction is the user's (2026-10-25); the vendor is
picked after the bake-off in [`product/realtime-voice.md`](../product/realtime-voice.md).

## Decision

- A new way to practise: a real-time voice session with the AI client, like a phone call.
- We use a vendor's real-time speech-to-speech model. We don't build our own pipeline of speech
  recognition, a text model and speech synthesis. Price is not the main concern; quality is.
- Candidates: Doubao real-time voice SC2.0 (Volcengine) and Qwen-Omni-Realtime (Alibaba Model
  Studio). Gemini Live is not offered in mainland China; OpenAI Realtime most likely isn't either.
- Hold-to-talk ([0010](./0010-voice-input.md)) stays as it is. Voice sessions are separate, with
  their own consent.

## Why

- The user wants the session to feel like talking to a person: interruptions, tone, silence.
  A speech-to-speech model hears the counselor's tone and answers with emotion in its voice; a
  pipeline we build ourselves wouldn't.

## Consequences

- **Audio leaves the phone.** Unlike 0010, the counselor's voice goes to the vendor. Separate
  consent before the first voice session; privacy labels gain "audio".
- **Ending the session changes.** Text mode holds back the closing line until the end check agrees
  (`END_SESSION_JUDGE`). Spoken audio can't be held back. Our server checks the live transcript
  and ends the session from its side; with a model that calls `end_session`, the call is checked
  the same way first.
- **New tests.** The DeepSeek prompt tests don't cover the new model. The bake-off runs the
  safety cases in `safety.md` on each candidate; they are pass/fail.
- **Hosting may change.** If the server has to stay connected for the whole session, Vercel
  functions don't fit.
