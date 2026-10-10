# API contract — app ↔ backend

The app (Kotlin Multiplatform, `apps/mobile`) never calls a model vendor. It calls our
backend (Hono, `apps/api`). This file is the contract both sides build against. Change it
in a PR that touches both sides, or not at all.

## Basics

- Base URL comes from build config. Local: `http://localhost:8787` (Android emulator:
  `http://10.0.2.2:8787`). Production: decided on the board (likely
  `https://psygym-api.novawerk.io`).
- JSON in, JSON or SSE out. UTF-8.
- Stateless. The app sends the whole conversation each turn. The server stores no
  transcript and never logs message text.
- Header `X-Invite-Code: <code>` on every request. The server checks it only when
  `INVITE_CODES` is set; otherwise any value (or none) passes.

## Models (shared shapes)

```ts
type Locale = "zh" | "en";
type Role = "counselor" | "client";          // counselor = the trainee, client = the AI
type Message = { role: Role; text: string };  // text ≤ 2000 chars, ≤ 80 messages
// Either role may come first.
type LocalizedText = { zh: string; en: string };
type CaseSummary = {
  id: string; school: "cbt"; title: LocalizedText; summary: LocalizedText;
  // Optional. Left out when the case doesn't have it; apps must cope with any of them missing.
  tags?: LocalizedText[];                       // 1–6, e.g. depression, anxiety
  difficulty?: "intro" | "medium" | "hard";
  estimatedMinutes?: number;                    // whole minutes, 1–180
  clientIntro?: LocalizedText;                  // pseudonym, age, role, why they came; no spoilers
  practiceFocus?: LocalizedText[];              // 1–3 things to practise
  contentNotes?: LocalizedText;                 // content note; the app has a generic fallback
};
```

## Endpoints

### `GET /health` → `200 {"ok":true}`

Never checks the invite code.

### `GET /cases` → `200 {"cases": CaseSummary[]}`

Only what the picker and the case intro show. The full case (the AI's role brief) stays on the
server. None of these fields is sent to the AI supervisor.

### `POST /chat` → `text/event-stream`

Body: `{ caseId: string, locale: Locale, messages: Message[] }`. The last message must be
the counselor's (else 400). The server answers as the client, in character.

The stream may carry a `session_end` frame (see below): the client ended the session in
character. The app then locks the input and leaves only "End and see supervision". The server
stays stateless: if the app sends another message after that anyway, the client answers with
one short line and that stream carries `session_end` again.

### `POST /supervision` → `text/event-stream`

Body: `{ caseId: string, locale: Locale, messages: Message[] }`. The server streams one
supervision report in Markdown: what went well, what went wrong, what to practise next.
Any message may come last, and a very short session still gets a report.

## Stream format (both streaming endpoints)

Data-only SSE frames, one JSON object per frame, discriminated by `type`:

```
data: {"type":"turn_start"}
data: {"type":"text_delta","text":"…"}
data: {"type":"session_end"}
data: {"type":"turn_end","usage":{"inputTokens":0,"outputTokens":0}}
data: {"type":"error","code":"model_unavailable","message":"…"}
: ping
```

- `text_delta` arrives zero or more times; the app appends `text` in order.
- `session_end` (`/chat` only) arrives at most once per stream (not per session), after the last `text_delta` and right
  before `turn_end`; nothing but `turn_end` follows it. It means the AI client ended the
  session in character (see [`safety.md`](./safety.md) §3). The app locks the input.
- Exactly one of `turn_end` or `error` ends the stream. `usage` is optional.
- The app ignores any frame `type` it doesn't know, so we can add frames later.
- `: ping` comments arrive every ~15 s; the app ignores them.

## Errors before the stream starts

JSON `{ "error": { "code": string, "message": string } }` with:

| HTTP | code | meaning |
|------|------|---------|
| 400 | `invalid_request` | body fails validation, or is too large (never 413) |
| 401 | `invite_required` | invite code missing or wrong |
| 404 | `case_not_found` | unknown `caseId` |
| 429 | `rate_limited` | too many requests; `Retry-After` header set |
| 503 | `model_unavailable` | no model configured or vendor down |

In a stream, `error` with `model_unavailable` also covers a model that returned an empty reply.

The app shows a friendly message for each code, in the current language.
