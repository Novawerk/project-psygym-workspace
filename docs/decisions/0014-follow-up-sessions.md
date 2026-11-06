# 0014 — Follow-up sessions: the same client, again

Date: 2026-11-06. Status: **accepted** (the user, 2026-11-06: "1234 都做，全部都做"). Built on both
sides. Replaces S-3 in [session-stages.md](../product/session-stages.md) ("after Christmas").

## Why

The project owner asked: after a first session, how does the trainee get to the second? Until
now every session was a first session. The client always opened like a stranger, and remembered
nothing. Real counselling runs over several sessions. The trainee has to practise picking up
from last time: reviewing homework, setting the agenda, keeping the relationship going.

## Decision

Four parts, all built:

1. **Cases are written in sessions.** A case says how many sessions it offers (`sessions`,
   default 3, at most 6; `1` = first session only). The body may hold a 「## 第二次会谈」,
   「## 第三次会谈」… section for each follow-up: what changed, the homework, what the client now
   says. Only that session's client sees its section (and the ones before it). Public notes per
   session (`followUps`: `clientIntro`, `practiceFocus`) go to the app. A case without these
   sections still works: the client goes on from the case and the last notes, with little change.
   聆镜 writes the clinical text. We only wrote the placeholder case's sections.
2. **The client remembers last time.** The server still stores no conversation. When a session
   ends, the app asks `POST /session-summary` for a short note: what was discussed, what was new,
   safety, what was agreed, how the relationship went. The app keeps it with the session in the
   local history. The next session sends the notes as `session.previous`. The client prompt swaps
   its first-session opening for [`client-follow-up.md`](../../apps/api/prompts/client-follow-up.md).
   The client remembers only what the notes say, and invents nothing beyond them.
3. **The supervisor looks at continuity.** In a follow-up the rubric's 「## 初次会谈怎么挑」 is
   dropped. 「## 后续会谈怎么挑」 is used in its place. Until 聆镜 writes that section, a placeholder
   does the job (`FOLLOW_UP_PICK_PLACEHOLDER` in `apps/api/src/session.ts`):
   - a short check on mood and safety;
   - point 9: review last time, set the agenda together, sum up;
   - points 2 and 3;
   - not point 10 (intake).

   The supervisor reads the notes as earlier records. It never quotes them and never treats them
   as said in this session. The intake reminder is for first sessions only. The risk-screening
   rule stays in every session.
4. **History strings sessions together.** A saved session has a `sessionNumber`, a `courseId`
   (the first session's id) and its `summary`.
   - The brief offers "Pick up · session N" for the most recent course of that case, or "Start
     over · first session".
   - The history list numbers sessions that follow on from each other.
   - The detail page has a Summary tab, the list of sessions with this client, and "Go on to
     session N".

## Details

- **Wire.** `session: { number, previous? }`, optional on `/chat`, `/supervision` (both modes),
  `/voice/session` and `/session-summary`. Left out: the first session, byte for byte as before.
  A number past the case's `sessions` is a 400. Notes: at most 5, each at most 1,200 characters.
  Each note's number must come before this session's.
- **Voice.** `/voice/session` puts the session into the `{{psygym}}` dynamic variable as base64url
  JSON. ElevenLabs passes the agent prompt back to `/voice/llm`, which reads it. No change to the
  ElevenLabs agent. `extraBody` stays strings only: the app reads it as a string map.
- **Notes are data.** Notes come from the phone, so the server wraps them in `<notes>` and escapes
  the tags, as it does for transcripts.
- **History off.** No note is asked for, and no course can go on. The brief says how to turn
  history on. Old saved sessions count as first sessions of their own.
- **Admin.** The trial chat can try any session number (with no notes). A 「第 N 次会谈」 section
  past `sessions` is a warning on the body.
- **Privacy.** `/session-summary` sends the same transcript to the same model vendor as
  `/supervision`. The note is stored only on the phone, in the same file as the session. The
  privacy policy's practice-history row now names it.

## Open, for 聆镜

- The follow-up sections of the two real cases, and `followUps` for them.
- 「## 后续会谈怎么挑」 in the CBT rubric, to replace the placeholder.
- Whether the risk-screening rule (first item when there were cues and no safety question) is
  right for follow-up sessions too, or should be softer there.
- How many sessions each case should offer (default 3).
