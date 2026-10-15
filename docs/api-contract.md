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
  transcript and never logs message text. It may keep counts per day, case and language
  (sessions started, reports, ratings, errors…): no text, no invite code, no IP
  ([`decisions/0007-anonymous-counts.md`](./decisions/0007-anonymous-counts.md)). With sign-in
  on, it also keeps pseudonymous active-account records that rotate every day and every week,
  never an email or an account id ([`decisions/0008-sign-in.md`](./decisions/0008-sign-in.md)). `/chat` and `/supervision` pass the conversation to
  the model vendor to get a reply, and nowhere else. The only conversation text that goes
  anywhere beyond that is one passage the user reports with `POST /report`.
- Header `X-Invite-Code: <code>` on every request. The server checks it only when
  `INVITE_CODES` is set; otherwise any value (or none) passes. With sign-in on, see
  [Sign-in](#sign-in): a session token replaces the invite code.

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

Body: `{ caseId: string, locale: Locale, messages: Message[], mode?: "final" | "live", durationSec?: number }`.
Any message may come last, and a very short session still gets an answer. Same frames either
way.

- `mode: "final"` (the default; leave it out for the same thing): the full report at the end, in
  Markdown, three sections: what went well, what to improve, what to practise next; the AI line
  last.
- `mode: "live"`: short notes mid-session, from the conversation so far. No headings; 1–3 `- `
  items, the first three of these that apply, in this order: a safety reminder (the client
  showed a risk cue and the counselor hasn't asked about safety yet), a harmful remark by the
  counselor (quoted, with a line to say instead), one thing that went well, one thing to try
  next with `可以换成：` / `Try instead:` and a line to say. About 150–250
  characters (zh) or 100–170 words (en). **No AI line**: the app writes it. "At least 3 turns"
  and "at most 5 per session" are the app's rules; the server doesn't check them: it only has
  its general rate limit (30 a minute per invite code or IP), shared with `final`. Per-account
  limits can come with sign-in. `live` ignores `durationSec`.
- Any other `mode` → `400 invalid_request`.

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

## Sign-in

> **Built, off by default.** The server keeps working exactly as described above until
> `AUTH_MODE=on`. Product spec: [`product/login.md`](./product/login.md). Decisions and
> storage: [`decisions/0008-sign-in.md`](./decisions/0008-sign-in.md).

Email and a one-time code; no passwords. The code arrives by email from
`no-reply@novawerk.io`. The invite code is asked once, when an account is created.

### Modes and the move from invite codes

Two settings: `AUTH_MODE` (`off` or `on`) and, with `on`, `AUTH_REQUIRED_FROM` (a date and time,
UTC). The app reads the current mode from `GET /health`.

| Mode | When | `/health` | `/auth/*`, `/me` | Every other endpoint (except `/health`) |
|---|---|---|---|---|
| `off` | today, default | `{"ok":true}` | `404 not_found` | invite code, as today |
| `optional` | `on`, before `AUTH_REQUIRED_FROM` (or it's unset) | `"auth":"optional"` | live | **either** a valid `Authorization: Bearer <token>` **or** a valid `X-Invite-Code` (or anything, when `INVITE_CODES` isn't set) |
| `required` | `on`, from `AUTH_REQUIRED_FROM` | `"auth":"required"` | live | `Authorization: Bearer <token>` only |

- A request that carries `Authorization` is judged by the token alone: a bad, expired,
  signed-out or deleted-account token is `401 session_expired`. An invite code next to it
  doesn't help. The app then signs in again.
- The move has no grace period (two testers, decided 2026-10-11). The server runs `optional` only
  while a build without sign-in is still in store review or in testers' hands; once the signed-in
  build has replaced it in both stores, we set `AUTH_REQUIRED_FROM` to that moment. From then on,
  a request without a token is `426 update_required`. Old apps don't know that code and show
  their generic error; new apps never send such a request.
- The signed-in app always signs in: it doesn't read `/health` to decide. It sends the token on
  every request, and no `X-Invite-Code`. (`/health` still reports the mode, for us.)

### `POST /auth/start` → `202` (no body)

Body: `{ email: string, locale: Locale }`.

- `email` is trimmed and lower-cased by the server; at most 254 characters; must look like an
  address. `locale` is the language of the email.
- The server answers `202` and then emails a 6-digit code, valid for 10 minutes (sent after
  the answer, so the response time doesn't tell whether the email has an account). A new
  `start` replaces the previous code at once.
- Always `202` for a well-formed request, whether or not the email has an account.
- Limits: one `start` per email per 60 s and 5 per hour; 20 per IP per hour. Over any →
  `429 rate_limited` with `Retry-After` (seconds; the app shows the countdown).
- Errors: `400 invalid_request`, `429 rate_limited`. If the email can't be sent, the app hears
  nothing more (the answer is already out): the user taps "send again".

### `POST /auth/verify` → `200`

Body: `{ email: string, code: string, inviteCode?: string }`. Answer:

```ts
type Me = { email: string; createdAt: string /* ISO 8601 */; inviteBatch: string | null };
type Session = { token: string; expiresAt: string /* ISO 8601 */; me: Me };
```

- The invite code comes after the email code (L3), with the **same** email code: no second
  email. For an email without an account:
  1. `verify` without `inviteCode` → `403 invite_required`. The code is **not** used up and
     this isn't a try. The app shows L3.
  2. `verify` again with the same code and `inviteCode`. Valid → the account is created, the
     code used up, a session returned. Not valid → `403 invite_invalid`, and it counts as one of
     the code's 5 tries (so invite codes can't be guessed endlessly).
  An app updated from the old version sends the invite code it kept on the first `verify`, so
  the user never sees L3. An email that already has an account ignores `inviteCode`.
- The account exists only once a valid invite code was given: no half-made accounts, nothing
  stored about an email that never got that far.
- The token is opaque: keep it in the platform's secure storage (Android Keystore, iOS
  Keychain); send it as `Authorization: Bearer <token>`.
- **The session lasts 90 days from its last use** and renews itself on requests, so someone who
  practises now and then doesn't sign in again. 90 days without a request →
  `401 session_expired`. `expiresAt` is the end as of now.
- Errors:
  - `400 invalid_code`: wrong, expired, already used, replaced by a newer code, or no tries
    left (5 per code). One code for all on purpose; the app says the code is wrong or no longer
    valid and offers to type it again or send a new one.
  - `403 invite_required`, `403 invite_invalid` (above).
  - `400 invalid_request`, `429 rate_limited` (30 per IP per hour, with `Retry-After`).

### `GET /me` → `200 Me`

Needs the token. Errors: `401 sign_in_required` (no token), `401 session_expired`.

### `POST /auth/logout` → `204`

Ends the session of the token sent. Also `204` if the token is unknown or already expired, so
the app can always call it and forget the token.

### `DELETE /me` → `204`

Deletes the account: the email, sign-up date, invite batch, every session and any pending
code, right away; and its pseudonymous active rows of today and this week. Counts already
totalled stay (they hold no account). Feedback and reports already sent to our Slack channel
never carried the email either. Needs the token; same `401` errors as `GET /me`. Afterwards
the account's other devices get `401 session_expired`.

Without the app (Google Play asks for this): the page `psygym.novawerk.io/delete-account`
explains it; the request goes by email to `info@novawerk.io`, from the account's address. We
delete within 30 days (ADR 0008).

### App review

One reviewer address, set on the server (`REVIEW_LOGIN_EMAIL`, `REVIEW_LOGIN_CODE`), signs in
with a fixed code; no email is sent and no invite code is asked. Only that address. Its fixed
code has no try limit and no per-email send limit (so nobody can lock the reviewer out by
typing wrong codes); the per-IP limit stays. Its activity isn't counted. Nothing changes for
the app.

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
  session in character (see [`safety.md`](./safety.md) §3). The app locks the input. If the model writes the
  end call into its reply as a tag (`<end_session>` and variants) instead of calling the tool, the server strips
  the tag from `text_delta` and sends `session_end` all the same; the app never sees the tag.
- Exactly one of `turn_end` or `error` ends the stream. `usage` is optional.
- The app ignores any frame `type` it doesn't know, so we can add frames later.
- `: ping` comments arrive every ~15 s; the app ignores them.

## Errors before the stream starts

JSON `{ "error": { "code": string, "message": string } }` with:

| HTTP | code | meaning |
|------|------|---------|
| 400 | `invalid_request` | body fails validation, or is too large (never 413) |
| 401 | `invite_required` | invite code missing or wrong |
| 401 | `sign_in_required` | (sign-in on) no session token where one is needed (`/me`, `/auth/logout`) |
| 401 | `session_expired` | (sign-in on) the token is wrong, expired, signed out, or its account was deleted |
| 426 | `update_required` | (`required` mode) no token: an old app after the move |
| 400 | `invalid_code` | (`/auth/verify`) wrong, expired, used, replaced or no tries left |
| 403 | `invite_required` | (`/auth/verify`) new email, no invite code; the code stays valid, no try used |
| 403 | `invite_invalid` | (`/auth/verify`) new email, invite code not valid; uses one try |
| 404 | `case_not_found` | unknown `caseId` |
| 429 | `rate_limited` | too many requests; `Retry-After` header set |
| 503 | `model_unavailable` | no model configured or vendor down |

In a stream, `error` with `model_unavailable` also covers a model that returned an empty reply.

The app shows a friendly message for each code, in the current language.

## Changes

- **sign-in implementation (this PR)** — the Sign-in section is built, behind `AUTH_MODE` (off by
  default: no change). Backend first; the app follows in its own PR, as with #62 and #70. With
  `AUTH_MODE` off, `/auth/*` and `/me` are `404 not_found` even when `INVITE_CODES` is set.

- **#70** — `POST /supervision` takes an optional `mode` (`"final"`,
  the default, or `"live"` for mid-session notes). Backend first; the app follows in a later PR,
  as allowed by the lead (old apps send no `mode` and get the report as before).
- **#64** — Sign-in contract (draft): `AUTH_MODE`, `AUTH_REQUIRED_FROM`, `/auth/start`, `/auth/verify`,
  `/auth/logout`, `GET /me`, `DELETE /me`, Bearer tokens, the move from invite codes, new error
  codes, `auth` in `/health`; Basics now mention pseudonymous active records. Proposed only;
  not live until the implementation PR, which touches both sides.
- **#62** — `POST /supervision` takes an optional `durationSec`. Backend first; the app sends it
  in a later PR. An exception to "both sides in one PR", allowed by the lead: the field is
  optional and old apps work unchanged.
