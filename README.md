# 聆镜 PSYGYM · 心理咨询师助手

> AI practice partners for new counselors.

**Status:** Launched · **Category:** App · **Year:** 2026

New counselors need practice and supervision. Both are hard to get. We build an
open-source tool where trainee counselors practise with an AI client and get
feedback from an AI supervisor.

聆镜 PSYGYM is part of the [Novawerk](https://novawerk.io) portfolio, built
with its founding team. We build in the open and we build for real.

## Where we are

Novawerk projects move through four steps: Validate, Break Down, Collaborate,
Build for Real. They loop through them many times.

Right now, this project is **Launched**, and handed over to its founding team.

- **17 October 2026: the MVP, at our first demo.** One school of therapy, CBT.
  The counselor talks with an AI client, then gets one supervision report. The
  interface in Chinese and English, the cases in Chinese. Simulated sessions
  only. No real client data.
- **Since then:** an admin panel where the psychologists write, try and publish
  cases and rubrics; hold-to-talk; voice sessions; a second and third session
  with the same client; supervision notes during a session.
- **15 November 2026: on the [App Store](https://apps.apple.com/app/id6821426508).**
  Android is in Play internal testing.
- **November 2026: handed over.** The founding team runs the content and finds
  its own developers. Novawerk keeps hosting the servers. See
  [`docs/handoff.md`](./docs/handoff.md).

Still open, now with the founding team: psychoanalysis and family therapy, more
cases and comorbidities, finer supervision and one-to-one training modules,
cases in English. See [`docs/product/roadmap.md`](./docs/product/roadmap.md).

This is a training tool for counselors. It is not therapy, and it is not for
patients.

- Website: [psygym.novawerk.io](https://psygym.novawerk.io).
- [`docs/problem-statement.md`](./docs/problem-statement.md): what we set out to
  validate.
- [`docs/decisions/`](./docs/decisions/): the stack and the calls we made.
- Board: [Jira PSY](https://novawerk-teams.atlassian.net/jira/software/projects/PSY/boards/67)
  (members only).

## Layout

| Path        | What                                                        |
|-------------|-------------------------------------------------------------|
| `apps/`     | Things people run: the practice app, the API, the website and the admin panel. |
| `packages/` | Shared code: the AI client, the supervisor, prompts, types.  |
| `content/`  | A copy of the published cases and rubrics. Our psychologists edit the live ones in the admin. |
| `docs/`     | Problem statement, decisions, notes.                         |

The app is Kotlin Multiplatform, for Android and iOS. The API is a Hono service.
See [`docs/decisions/0001-stack.md`](./docs/decisions/0001-stack.md).

## How to contribute

We work open by default. To join:

1. Read [about Novawerk](https://novawerk.io/about) and its three principles.
2. Open an issue with what you'd like to take on: one artifact, one owner,
   one done-by date.
3. Or apply at [novawerk.io/join](https://novawerk.io/join).

We assume good faith. We make it cheap to try.

## Licence

MIT. See [LICENSE](./LICENSE).
