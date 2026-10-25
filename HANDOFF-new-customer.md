# Handoff — new customer request (practice dialogues → AI client, then voice)

Date: 2026-10-25. From the cloud session https://claude.ai/code/session_014oLUSkMBYfV4qSYBdCKpe1.

## Who and what

- **Customer:** atom (a practitioner working with 聆镜). Email to the team's Google Group
  `info@novawerk.io`, subject 「一些对话数据集」, six `.docx` attachments: 前几次的一些情况,
  2, 3, 5, 6, 7.
- **The ask (from the user):** use the dialogues to improve the AI client. The team said practice
  "feels like a puzzle game".
- **Data, as the user confirmed:** simulated practice sessions, shared with consent,
  de-identified. One client (a psychology student), long-term, psychodynamic style: a first
  session excerpt and sessions 2, 3, 5, 6, 7.
- **Where the files are:** uploaded by the user into the cloud session only (session uploads and
  its scratchpad). **Not in this repo, on purpose** (public repo; consent covers improving the
  tool, not publishing). Ask the user for the files again if you need them.
- **Later ask (from the user, same session):** real-time voice conversation through an
  ElevenLabs voice agent.

## What the dialogues show (no quotes, patterns only)

- The client's median turn is 113–438 characters; the counselor's 8–19. Short echoes from the
  counselor get long answers.
- New material comes from the client following her own thread (memories, dreams), not from a
  well-aimed question.
- Uneven speech: slips she corrects, losing the thread, filler, contradictions.
- She asks the counselor things and talks about the here and now.
- Resistance is soft ("I don't know", "never mind", laughing it off); she keeps talking.

## Done

| What | Where | State |
|---|---|---|
| AI client prompt rewritten from the patterns above; no length cap; no "ask the right question to unlock" | `apps/api/prompts/client.md`, branch `claude/determined-newton-3022sj` | PR **Novawerk/project-psygym-workspace#122**, open, includes Haodong's #121 commit. Session subscribed to its activity; a self check-in was scheduled ~16:07 UTC |
| Trauma no longer gated on "trust is built" (user: "不要有这个东西，我们不是解密游戏"). Kept: one or two summary sentences, never details | prompt + `docs/safety.md` §4a (marked 待聆镜确认) | in #122 |
| Decision record | `docs/decisions/0012-client-speaks-like-practice-dialogues.md` | in #122 |
| Acceptance/test plan updated (B5, B6) | `docs/mvp-acceptance.md`, `docs/test-plan.md` | in #122 |
| Voice backend: `POST /voice/llm/chat/completions` (ElevenLabs custom LLM, our prompt/case/end_session/judge, `end_session` → `end_call`), `POST /voice/session` (conversation token) | `apps/api/src/voice.ts`, `apps/api/src/app.ts`, `config.ts`, `.env.example`, `test/voice.test.ts` | commit `52c9272`, branch `claude/elevenlabs-voice`. **Local only, not pushed** (pushing a new branch needs the user's OK) — this handoff branch contains that commit |
| Voice decision and contract | `docs/decisions/0013-voice-elevenlabs.md`, `docs/api-contract.md` | same commit |

Checks: `apps/api` 308/308 tests pass (`--testTimeout=30000`; two auth tests time out at 5 s in a
slow container), `tsc --noEmit` clean. Nothing run against a real model or ElevenLabs (no keys).

**Jira:** no cards. The connected Atlassian account only reaches `lengsaeb.atlassian.net`, not
`novawerk-teams` (board PSY). Draft cards were given to the user (Epic PSY-2): review voice
backend; set up the ElevenLabs agent; voice spike (one real call, latency/cost/voice); check
ElevenLabs plan and data terms (Zero Retention Mode is enterprise); app voice session
(Android + iOS SDKs); privacy docs for voice. Also two for #122: 聆镜 confirms the trauma change;
run the `quality` script with a real model.

## Decisions and why

- Learn how the client talks, not how the counselor works: the sessions are psychodynamic, our
  cases are CBT first sessions.
- Transcripts stay out of the repo (public).
- Voice: ElevenLabs only listens and speaks; our backend stays the brain, so there is one prompt
  and one set of safety rules. Off by default (three env vars). The user agreed ("同意").
- Voice reverses part of ADR 0010 (audio never uploaded) for voice sessions only; privacy docs
  must change before the app ships it.

## Open questions for the user

1. May `claude/elevenlabs-voice` be pushed and get its own PR?
2. Who sets up the ElevenLabs account/agent and provides the key?
3. Owner and done-by date for each card; reconnect Atlassian to `novawerk-teams` so the cards can
   be created.
4. Send the before/after to atom?

## Next

1. Get answers to 1–3. Push the voice branch, open its PR.
2. Create the Jira cards.
3. With a key: run one real ElevenLabs call (check the request shape: `elevenlabs_extra_body` vs.
   the `case=… locale=…` marker, and the server URL path), then the app side.
4. Keep #122 moving: real-model run, 聆镜 review of the trauma change.
