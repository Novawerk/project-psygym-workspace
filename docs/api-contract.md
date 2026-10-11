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
  transcript and never logs message text. It may keep anonymous counts per day, case and
  language (sessions started, reports, ratings, errors…): no text, no invite code, no IP, no
  id of any kind ([`decisions/0007-anonymous-counts.md`](./decisions/0007-anonymous-counts.md)). `/chat` and `/supervision` pass the conversation to
  the model vendor to get a reply, and nowhere else. The only conversation text that goes
  anywhere beyond that is one passage the user reports with `POST /report`.
- Header `X-Invite-Code: <code>` on every request. The server checks it only when
  `INVITE_CODES` is set; otherwise any value (or none) passes. With sign-in on, see
  [Sign-in](#sign-in-proposed-not-live-yet): a session token replaces the invite code.

## Models (shared shapes)

```ts
type Locale = "zh" | "en";
type Role = "counselor" | "client";          // counselor = the trainee, client = the AI
type Message = { role: Role; text: string };  // text ≤ 2000 chars, ≤ 80 messages
// Either role may come first.
type LocalizedText = { zh: string; en: string };  // both always non-empty; en falls back to zh
type CaseSummary = {
  id: string; school: "cbt"; title: LocalizedText; summary: LocalizedText;
  // Optional. Left out when the case doesn't have it; apps must cope with any of them missing.
  // Authors may write Chinese only: then en carries the zh text. In tags and practiceFocus a bad
  // entry is dropped on its own, and past 3 entries we keep the first 3.
  tags?: LocalizedText[];                       // 1–3, e.g. depression, anxiety
  difficulty?: "intro" | "medium" | "hard";
  estimatedMinutes?: number;                    // whole minutes, 1–180
  clientAlias?: LocalizedText;                  // the client's pseudonym, e.g. 小林 / Lin
  clientIntro?: LocalizedText;                  // pseudonym, age, role, why they came; no spoilers
  practiceFocus?: LocalizedText[];              // 1–3 things to practise
  contentNotes?: LocalizedText;                 // content note; the app has a generic fallback
};
```

## Endpoints

### `GET /health` → `200 {"ok":true}`

Never checks the invite code. With sign-in on, it also says which mode the server runs:
`{"ok":true,"auth":"optional"}` or `{"ok":true,"auth":"required"}` (see Sign-in). With sign-in
off it stays exactly `{"ok":true}`.

### `GET /cases` → `200 {"cases": CaseSummary[]}`

Only what the picker and the case intro show. The full case (the AI's role brief) stays on the
server. None of these fields is sent to the AI supervisor.

### `POST /chat` → `text/event-stream`

Body: `{ caseId: string, locale: Locale, messages: Message[] }`. The last message must be
the counselor's (else 400). The server answers as the client, in character.

The stream may carry a `session_end` frame (see below): the client ended the session in
character. The app then locks the input and leaves only "End and see supervision". The server
stays stateless: if the app sends another message after that anyway, the client answers with
one short line and that stream should carry `session_end` again. That repeat is best effort
(it depends on the model); the app goes by the first `session_end` and keeps the input locked.

### `POST /supervision` → `text/event-stream`

Body: `{ caseId: string, locale: Locale, messages: Message[], durationSec?: number }`. The
server streams one supervision report in Markdown: what went well, what went wrong, what to
practise next. Any message may come last, and a very short session still gets a report.

`durationSec` (optional): how long the session lasted, in whole seconds, 0–7200. It only feeds
the anonymous daily counts (the sum and the number of sessions that sent it); it never changes
the report. A value that isn't a whole number in that range is ignored, never a 400. An app
that doesn't send it works as before.

### `POST /feedback` → `204` (no body)

Body: `{ caseId: string, locale: Locale, rating: "up" | "down", comment?: string }`. A rating of
one supervision report. `comment` is at most 500 characters. The conversation is never sent as a
field: any other field is a 400. (A user can still paste text from the session into the comment
themselves, up to 500 characters.) Same invite code and rate limit as the other endpoints (its
own bucket).

`204` means we received it. Our server stores nothing; it forwards the feedback to the team's
private Slack channel, where Slack keeps the message (or drops it when that isn't set up).
Delivery is best effort; the app shows "thanks" either way. Errors: `400 invalid_request`,
`401 invite_required`, `404 case_not_found`, `429 rate_limited`.

### `POST /report` → `204` (no body)

The user reports one AI passage from inside the app: a reply from the AI client, or a passage of
the supervision report.

```ts
{
  caseId: string;
  locale: Locale;
  source: "client_reply" | "report";             // where the passage comes from
  reason: "harmful" | "out_of_role" | "unsafe_advice" | "other";  // keys match the app's copy
  comment?: string;                               // the user's note, ≤ 500 characters
  reportedText: string;                           // the reported passage, 1–2000 characters
}
```

**This is the only request whose conversation text we pass on.** The server forwards the
reported passage, the reason and the note to the team's private Slack channel, marked as a
report. Our server stores nothing; Slack keeps the message. Exactly one passage, which the app
shows the user before sending; never the rest of the session: any other field is a 400. Our log
keeps only ids, enums and lengths, never the passage or the note.

Same invite code check; same rate limit, its own bucket. Same delivery as `/feedback`: `204`
either way, best effort, dropped when Slack isn't set up. Errors: `400 invalid_request`,
`401 invite_required`, `404 case_not_found`, `429 rate_limited`.

## Sign-in (proposed, not live yet)

> **Draft for review.** Nothing below is live. The server keeps working exactly as described
> above until `AUTH_MODE` is set. Decisions and storage: [`decisions/0008-sign-in.md`](./decisions/0008-sign-in.md).

Email and a one-time code; no passwords. The code arrives by email from
`no-reply@novawerk.io`.

### Modes and the move from invite codes

The server runs in one of three modes (`AUTH_MODE`). The app reads it from `GET /health`.

| Mode | `/health` | `/auth/*`, `/me` | Every other endpoint (except `/health`) |
|---|---|---|---|
| `off` (today, default) | `{"ok":true}` | `404 not_found` | invite code, as today |
| `optional` (move-over) | `"auth":"optional"` | live | **either** a valid `Authorization: Bearer <token>` **or** a valid `X-Invite-Code` (or anything, when `INVITE_CODES` isn't set) |
| `required` | `"auth":"required"` | live | `Authorization: Bearer <token>` only; `X-Invite-Code` alone is `401 sign_in_required` |

- In `optional` and `required`, a request that carries `Authorization` is judged by the token
  alone: a bad or expired token is `401 session_expired`, even if an invite code is there too.
  The app then signs in again.
- Old apps (invite code only) keep working through `optional`. We switch to `required` only once
  the counts show that old apps are gone (we count requests by how they authenticated:
  `session` or `invite`, no ids), and announce the date first. After the switch an old app gets
  `401 sign_in_required`, a code it doesn't know: it shows its generic error.
- A new app: if `/health` says `optional` or `required`, it signs in and sends the token on
  every request. It sends no `X-Invite-Code` with a token.

### `POST /auth/start` → `202` (no body)

Body: `{ email: string, locale: Locale, inviteCode?: string }`.

- `email`: trimmed and lower-cased by the server; at most 254 characters; must look like an
  address. `locale`: the language of the email.
- `inviteCode`: needed only for an email that has no account yet. It is checked at
  `/auth/verify`, not here (so this endpoint never tells anyone whether an email has an account).
- The server emails a 6-digit code, valid for 10 minutes. A new `start` for the same email
  replaces the previous code.
- Always `202` for a well-formed request, whether or not the email has an account.
- Rate limits, both apply: per email (5 per hour) and per IP (20 per hour). Over either →
  `429 rate_limited` with `Retry-After`.
- Errors: `400 invalid_request`, `429 rate_limited`, `503 email_unavailable` (the email
  couldn't be sent; try again later).

### `POST /auth/verify` → `200`

Body: `{ email: string, code: string }`. Answer:

```ts
type Me = { email: string; createdAt: string /* ISO 8601 */; inviteBatch: string | null };
type Session = { token: string; expiresAt: string /* ISO 8601 */; me: Me };
```

- On success the code is used up and the account exists (created now, for a new email with a
  valid invite code from `start`). The token is opaque: keep it in the platform's secure
  storage (Android Keystore, iOS Keychain), send it as `Authorization: Bearer <token>`.
- A token lasts 30 days from sign-in. Then `401 session_expired`; sign in again.
- Errors:
  - `400 invalid_code`: wrong, expired, already used, or too many tries (5 per code). One code
    for all four on purpose. The app offers "send a new code".
  - `403 invite_required`: the email has no account and `start` carried no valid invite code.
    The app asks for an invite code and calls `start` again with it.
  - `400 invalid_request`, `429 rate_limited`.

### `GET /me` → `200 Me`

Needs the token. Errors: `401 sign_in_required` (no token), `401 session_expired`.

### `POST /auth/logout` → `204`

Ends the session of the token sent. Also `204` if the token is unknown or already expired, so
the app can always call it and forget the token.

### `DELETE /me` → `204`

Deletes the account: the email, every session and any pending code, right away. Anonymous
counts stay (they never held the account). Feedback and reports already sent to our Slack
channel never carried the account either. Needs the token; same `401` errors as `GET /me`.

### App review

One reviewer address, set on the server, signs in with a fixed code and no email is sent. It
only works for that one address. Nothing changes for the app.

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
| 401 | `sign_in_required` | (sign-in on) no session token where one is needed |
| 401 | `session_expired` | (sign-in on) the token is wrong, expired or signed out |
| 400 | `invalid_code` | (`/auth/verify`) wrong, expired, used or too many tries |
| 403 | `invite_required` | (`/auth/verify`) new email without a valid invite code |
| 503 | `email_unavailable` | (`/auth/start`) the code email couldn't be sent |
| 404 | `case_not_found` | unknown `caseId` |
| 429 | `rate_limited` | too many requests; `Retry-After` header set |
| 503 | `model_unavailable` | no model configured or vendor down |

In a stream, `error` with `model_unavailable` also covers a model that returned an empty reply.

The app shows a friendly message for each code, in the current language.

## Changes

- **(draft, this PR)** — Sign-in: `AUTH_MODE`, `/auth/start`, `/auth/verify`, `/auth/logout`,
  `GET /me`, `DELETE /me`, Bearer tokens, the move from invite codes, new error codes, `auth`
  in `/health`. Proposed only; not live until the implementation PR, which touches both sides.
- **#62** — `POST /supervision` takes an optional `durationSec`. Backend first; the app sends it
  in a later PR. An exception to "both sides in one PR", allowed by the lead: the field is
  optional and old apps work unchanged.
