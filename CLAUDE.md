# Agent guide — 聆镜 PSYGYM (心理咨询师助手)

This repo is part of the [Novawerk](https://novawerk.io) portfolio. When you
need canonical facts about Novawerk (tagline, mission, the three principles,
brand voice, how-we-work, open-by-default, ways to join, titles and roles,
community), use the [`nw-knowledge-base`](./.claude/skills/nw-knowledge-base/SKILL.md)
skill already installed in this repo. Do not invent Novawerk facts — read the KB.

## What this project is

AI practice partners for new counselors: an AI client to practise with, and an
AI supervisor that points out mistakes and suggests what to work on.

Status: **Launched** · Category: **App** · Built with its founding team, and
handed over to them in November 2026 ([docs/handoff.md](./docs/handoff.md)).

Work is tracked on the Jira board `PSY` (site `novawerk-teams.atlassian.net`,
board 67). Epic PSY-1 is the MVP, shown at the first demo on 17 October 2026.
PSY-2 is everything else. What is left of it is with the founding team's own
developers ([docs/product/roadmap.md](./docs/product/roadmap.md)).

See [README.md](./README.md) and [docs/](./docs/).

## Layout

pnpm monorepo, in the style of Novawerk's own repo:

- `apps/*` — things people run.
- `packages/*` — shared code.
- `content/` — a copy of the published cases and rubrics. The live ones are
  edited in the admin. Psychologists own this text; don't rewrite clinical
  content without them.
- `docs/` — problem statement and decisions.

The stack is chosen: see [docs/decisions/0001-stack.md](./docs/decisions/0001-stack.md).
Merging does not deploy. Deploys and app releases go through the account
holders: see [docs/deploy.md](./docs/deploy.md), and ask first.

## House rules

- **Brand voice.** Short sentences. "We", present tense. No *leverage,
  ecosystem, stakeholders, synergy, disrupt, transform*.
- **Open by default.** Decisions get written down somewhere durable. If
  you make a call worth remembering, leave a trail in `docs/`.
- **Clear scope.** Every work item has one artifact, one owner, one done-by
  date. Reject items that don't fit that shape — keep cutting.
- **Build for real.** Step 04 is the only step that counts. A great
  validation that never gets built doesn't count.
- **Safety.** Simulated sessions only. Never store real client data. Say
  plainly in the product that this is a training tool, not therapy.
