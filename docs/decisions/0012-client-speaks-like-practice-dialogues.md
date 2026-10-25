# 0012 — The AI client speaks like a real client in practice sessions

Date: 2026-10-25. Status: **accepted** (the user, 2026-10-25). Builds on
[0011](./0011-client-talks-freely.md).

## Decision

`apps/api/prompts/client.md` 「像真人一样说话」 is rewritten from what we saw in six practice
dialogues, and trauma is no longer held back until "trust is built".

- **The client talks much more than the counselor.** A paragraph is normal. When the counselor
  echoes a word or asks something short, the client keeps going. After a closed question or an
  interpretation, it may answer in one word.
- **It brings things up itself.** It may open with something from this week, and it moves from one
  memory to the next ("我突然想到一件事……"). Any layer of the case can come up when the talk gets
  near it. The case's 「会透露什么、不会轻易透露什么」 now says what is harder to say, not what
  is locked.
- **It talks unevenly.** Slips it corrects, losing the thread, tangents, filler words,
  contradictions it doesn't notice.
- **It asks the counselor things and talks about the here and now.** "Do you follow me?",
  curiosity or unease about counselling itself.
- **Resistance is soft.** "I don't know", "never mind", laughing it off, arguing. It keeps talking;
  it doesn't go silent.
- **Trauma (`safety.md` §4a):** the client may bring it up when the talk gets near that time or
  topic, like anything else. Removed: "only at the deepest layer", "only the first line until
  trust is built", "the second layer only after the counselor has held the emotion".
- **Unchanged:** one or two summary sentences about trauma, never details (no sexual content, no
  violence, no who/where/how; for minors, no method or course of events). Suicide and self-harm
  rules, harmful-content threshold and `end_session` are untouched.

## Why

- The team heard that practice "feels like a puzzle game": the counselor guesses the right
  question to unlock the next fact. That trains the wrong thing.
- A practitioner sent us six transcripts of simulated practice sessions (one client, a first
  session and sessions 2, 3, 5, 6 and 7), shared with consent and de-identified. In them, the
  client's median turn is 113–438 characters and the counselor's is 8–19. New material almost
  always comes from the client following her own thread, not from a well-aimed question.
- The sessions are psychodynamic, not CBT. We take how the client talks, not how the counselor
  works, and none of the content.
- The trauma gate was the same puzzle in its strictest form.

## Consequences

- **The transcripts stay out of this repository.** The repo is public; consent covered improving
  the tool, not publishing. The prompt and this file only hold patterns and short made-up examples.
- Replies get longer and less tidy. The supervisor sees more client talk per turn.
- The psychologists who wrote the cases should confirm the trauma change (`safety.md` §4a,
  marked 待聆镜确认). Richer 「说话风格」 sections (filler words, sample lines) would help the
  client sound like the person in the case; we suggest it, we don't edit the cases.
- `demo-script.md` and `content-review-2026-10-15.md` describe the old trauma gate. They are
  dated records and stay as they were.
