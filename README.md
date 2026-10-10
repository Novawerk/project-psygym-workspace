# 心理咨询师助手 · PSYGYM

> AI practice partners for new counselors.

**Status:** Planning · **Category:** App · **Year:** 2026

New counselors need practice and supervision. Both are hard to get. We build an
open-source tool where trainee counselors practise with an AI client and get
feedback from an AI supervisor.

心理咨询师助手 is part of the [Novawerk](https://novawerk.io) portfolio, built
with 聆镜PSYGYM. We build in the open and we build for real.

## Where we are

Novawerk projects move through four steps: Validate, Break Down, Collaborate,
Build for Real. They loop through them many times.

Right now, this project is **Planning**. Two milestones:

1. **MVP, by the weekend of 17–18 October 2026**, for our first demo:

   - one school of therapy: CBT;
   - one or two cases: depression, depression with anxiety;
   - the counselor talks with an AI client, then gets one supervision report;
   - the interface in Chinese and English, the cases in Chinese first;
   - simulated sessions only. No real client data.

2. **Everything 聆镜PSYGYM needs, by Christmas 2026**: psychoanalysis and
   family therapy, more cases and comorbidities, finer supervision and
   one-to-one training modules, cases in English.

This is a training tool for counselors. It is not therapy, and it is not for
patients.

- [`docs/problem-statement.md`](./docs/problem-statement.md): what we are
  validating.
- Board: [Jira PSY](https://novawerk-teams.atlassian.net/jira/software/projects/PSY/boards/67)
  (members only).

## Layout

| Path        | What                                                        |
|-------------|-------------------------------------------------------------|
| `apps/`     | Things people run: the practice app, later an API.          |
| `packages/` | Shared code: the AI client, the supervisor, prompts, types.  |
| `content/`  | Cases and supervision rubrics, written by our psychologists. |
| `docs/`     | Problem statement, decisions, notes.                         |

We pick the stack once the problem statement is honest. Until then the folders
are empty on purpose.

## How to contribute

We work open by default. To join:

1. Read [about Novawerk](https://novawerk.io/about) and its three principles.
2. Open an issue with what you'd like to take on: one artifact, one owner,
   one done-by date.
3. Or apply at [novawerk.io/join](https://novawerk.io/join).

We assume good faith. We make it cheap to try.

## Licence

MIT. See [LICENSE](./LICENSE).
