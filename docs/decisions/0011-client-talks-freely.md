# 0011 — The AI client talks freely

Date: 2026-10-20. Status: **accepted**.

## Decision

The AI client no longer holds information back, and its replies have no length limit.

- `apps/api/prompts/client.md` drops two rules: "the first turn is only the reason for coming
  (one or two sentences), then answer only what is asked, revealing the case layer by layer", and
  "a reply is usually no more than 150 characters".
- Instead: when the talk comes near something in the case, the client brings it up itself,
  including what the case lists under 「建立信任后才说」. It can talk at length, the way a real
  client does.
- **Unchanged:** trauma (`safety.md` and the 「创伤经历」 section of the prompt). The client still
  doesn't bring it up first and never describes details. (Changed by
  [0012](./0012-client-speaks-like-practice-dialogues.md): trauma is no longer held back either.) No lists, headings or Markdown.
- Case files in `content/` are not edited. The prompt overrides their 「建立信任后才说」 timing.

## Why

- Practice is not a puzzle game. The counselor shouldn't have to dig facts out one question at a
  time; real clients often talk on and on, and learning when and how to step in is part of the
  skill.
- We saw it while trying voice sessions: short, guarded replies felt unnatural out loud.

## Consequences

- Acceptance B5 and B6 change (`mvp-acceptance.md`, `test-plan.md`). Replies get longer; the
  phone shows longer bubbles.
- The psychologists who wrote the cases should know: the 「会透露什么、不会轻易透露什么」 section
  now only matters for trauma and for what the client knows at all, not for when it is said.
