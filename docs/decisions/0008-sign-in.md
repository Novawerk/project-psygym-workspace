# 0008 — Sign-in by email code (proposed)

Date: 2026-10-11. Status: **proposed**, for review by the lead and mobile before any code. The
product spec is [`product/login.md`](../product/login.md); the contract part is in
[`api-contract.md`](../api-contract.md#sign-in-proposed-not-live-yet). Backend and product
agreed the details together (2026-10-11); where this file and the product spec differ, say so
in review.

**Supersedes** one line of ADR 0007: "no id of any kind". With sign-in on, the database also
holds pseudonymous active-account records (below). They are pseudonymous, not anonymous: with
the server's secret, a record can be matched to an account.

## What and why

The user decided (D-A1 = F): the app gets accounts before the demo. Email and a one-time code,
sent with Resend from `no-reply@novawerk.io` (a domain Novawerk's Resend already verified). No
passwords, no Google (聆镜's colleagues may not reach it), so Apple doesn't ask for Sign in with
Apple either.

## Switch, cold start

- `AUTH_MODE=off|on`, default `off`. With `off` nothing changes: same answers,
  and, as in #62, a cold start loads no database or auth code (`/auth/*` and `/me` are a 404;
  the auth module is a dynamic import made only when the mode isn't `off`). A test checks the
  modules loaded, like `test/cold-start.test.ts`.
- The move: with `on`, the server is `optional` until `AUTH_REQUIRED_FROM` (a UTC date-time in
  the config, set about 14 days after the signed-in app ships), `required` after. No hand edit
  of the mode on the day. In `required`, a request without a token is `426 update_required`. We
  count requests by how they authenticated (`auth`, dim `session` or `invite`, no ids) to see
  the old app fade out before setting the date.

## Storage (Drizzle, same Neon database as #62)

| Table | Columns | Notes |
|---|---|---|
| `users` | `id` (random UUID), `email` (lower-case, unique), `created_at`, `invite_batch` (text, null) | Nothing else about a person. |
| `login_codes` | `email_hash` (sha256 of the email, primary key), `code_mac`, `expires_at`, `tries_left`, `sent_at` (the last few, for the hourly limit) | One pending code per email; a new `start` replaces it. The email itself isn't stored until the account exists. Rows go when used, expired (swept on the next `start`), or the account is deleted. |
| `sessions` | `token_hash` (sha256, primary key), `user_id`, `created_at`, `expires_at` | Token: 32 random bytes, base64url, shown once. |

- **Sessions:** 90 days from the last use, renewed on use (the lead's call: a practice app that
  makes people sign in again and again is a nuisance). To keep writes down, `expires_at` moves
  forward at most once a day per session. Logout deletes the row; `DELETE /me` deletes all of
  the account's rows, so its other devices get `session_expired` (the app doesn't tell "deleted"
  from "expired").
- **Codes:** 6 digits, 10 minutes, 5 tries, one per email. `code_mac` = HMAC-SHA256 with a
  server key (`AUTH_SECRET`), so a leaked table doesn't give codes away by trying all 10⁶.
  `verify` without an invite code for a new email doesn't use a try or the code (the app shows
  L3 and sends the same code again); a wrong invite code uses a try.
- **Limits on `start`:** one per email per 60 s and 5 per email per hour (from `login_codes`,
  so they hold across instances); 20 per IP per hour (in memory, per warm instance, like today).
- **Timing:** `start` answers `202` before it looks anything up that depends on the account, and
  sends the email after the answer (`waitUntil`), so the response time doesn't tell whether the
  email has an account. A failed send is a log line; the user taps "send again".
- **Invite batches:** `INVITE_CODES` may name batches (`code:batch`, e.g. `x7k2:lingjing-pilot-1`).
  A new account stores the batch name, never the code. A code without a name gets batch
  `default`. The same codes keep working for old apps during the move.
- **Email:** Resend's HTTP API with `fetch` (no SDK), `RESEND_API_KEY`, 5 s timeout, the text in
  `product/login.md` §3 (no links, no images, code in the subject). The log never has the
  address or the code: only "sent", "failed" and the error kind.

## Reviewer

`REVIEW_LOGIN_EMAIL` and `REVIEW_LOGIN_CODE`. For that exact address only: `start` sends no
email, `verify` takes the fixed code, no invite code is asked, and the account is created on
first sign-in with batch `review`. The fixed code has no try limit and no per-email send limit
(anyone could otherwise lock the reviewer out by typing wrong codes for that address); the
per-IP limit stays. Its activity isn't counted. Both unset (outside review): the address is an
ordinary one and gets real codes. A new code before each store submission.

## Active accounts, pseudonymously

The product wants daily and weekly active accounts, also per invite batch. One request counts:
the first `/chat` of the day.

- **Two keys that rotate.** From `METRICS_ID_SECRET`:
  `dayKey = HMAC(secret, "day:" + date)` and `weekKey = HMAC(secret, "week:" + ISO week)`.
  The pseudonym is `HMAC(dayKey, user_id)` in `active_day(day, pid, invite_batch)` and
  `HMAC(weekKey, user_id)` in `active_week(week, pid, invite_batch)`, each inserted with "on
  conflict do nothing". The same account gets an unrelated pseudonym every day and every week:
  rows of different days, or of different weeks, can't be joined, and none can be tied to an
  account without the secret. A day row and a week row of the same account can't be joined
  either (different keys).
- **Rolled up, then deleted.** A finished day becomes `active_day` counts in `daily_counts`
  (overall, dim `""`, and per batch, dim = batch name), and its `active_day` rows are deleted.
  A finished ISO week becomes `active_week` counts (on the week's Sunday), and its rows are
  deleted. Raw rows live at most until the next request after their day or week ends. The
  roll-up runs on the first request of a new day and from `GET /admin/stats`.
- **Weekly means the ISO week** (Monday to Sunday), not a rolling 7 days: a rolling window would
  need to link days, which the rotating key prevents on purpose.
- `daily_counts` never holds a pseudonym, an account id, an email or an invite code.
- **Small numbers:** `<5` hiding and the rest of ADR 0007 apply to every cell, overall and per
  batch; a small batch shows `<5`.
- **Deleting an account:** we compute today's and this week's pseudonyms and delete those rows.
  Earlier rows are already gone; totals stay.
- **Not counted:** the reviewer account. `METRICS_ID_SECRET` unset: no active counts at all.

## Deleting an account without the app

Google Play asks for a way to request deletion on the web. For the demo and the first
submission: the privacy policy (`docs/release/privacy-policy.md`) gets a section "Delete your
account": email `info@novawerk.io` from the account's address. We confirm by replying to that
address, then delete within 30 days with an admin call:

- `POST /admin/accounts/delete { email }`, `Authorization: Bearer <ADMIN_TOKEN>` (a token of its
  own, not the stats token). It does exactly what `DELETE /me` does. It answers `204` whether or
  not the email had an account. The log keeps the email's hash, not the email.

Before the public release a page on novawerk.io replaces the email (to confirm with release).

## Open questions for review

1. Per-batch active counts: is `<5` hiding enough for a batch of one class, or should small
   batches be merged into "other"?
2. The web deletion page: who builds it on novawerk.io, and when.
