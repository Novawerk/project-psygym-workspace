# 0008 — Sign-in by email code (proposed)

Date: 2026-10-11. Status: **proposed**, for review by the lead and mobile before any code. The
contract part is in [`api-contract.md`](../api-contract.md#sign-in-proposed-not-live-yet).

## What and why

The user decided: the app gets sign-in before the demo. Email and a one-time code, sent with
Resend from `no-reply@novawerk.io` (a domain Novawerk's Resend already verified). No passwords,
no Google (聆镜's colleagues may not reach it).

## Switch, cold start

- `AUTH_MODE=off|optional|required`, default `off`. With `off` nothing changes: same answers,
  and, as in #62, a cold start loads no database or auth code (`/auth/*` and `/me` are a 404;
  the auth module is a dynamic import made only when the mode isn't `off`). A test checks the
  modules loaded, like `test/cold-start.test.ts`.
- `optional` is the move-over: a token or an invite code. `required` once old apps are gone.
  We see that from a new count, `auth` with dim `session` or `invite` (no ids).

## Storage (Drizzle, same Neon database as #62)

| Table | Columns | Notes |
|---|---|---|
| `users` | `id` (random UUID), `email` (lower-case, unique), `created_at`, `invite_batch` (text, null) | Nothing else about a person. |
| `login_codes` | `email_hash` (sha256 of the email, primary key), `code_hash`, `expires_at`, `attempts`, `invite_batch` (null) | One pending code per email; a new `start` replaces it. The email itself isn't stored until the account exists. Rows go when used, expired (swept on the next `start`), or the account is deleted. |
| `sessions` | `token_hash` (sha256, primary key), `user_id`, `created_at`, `expires_at` | Token: 32 random bytes, base64url, shown once. 30 days. Logout and `DELETE /me` delete rows. |

- **Codes:** 6 digits, 10 minutes, 5 tries. `code_hash` = HMAC-SHA256 with a server key
  (`AUTH_SECRET`), so a leaked table doesn't give codes away by brute-forcing 10⁶ values.
- **Invite batches:** `INVITE_CODES` may name batches (`code:batch`, e.g. `x7k2:lingjing-pilot-1`).
  A new account stores the batch name, never the code. A code without a name gets batch
  `default`.
- **Reviewer:** `REVIEW_EMAIL` and `REVIEW_CODE`. For that exact address only, `start` sends no
  email and `verify` takes the fixed code. Both unset: no reviewer. The account is ordinary
  (batch `review`), so the reviewer can test `DELETE /me` too.
- **Email:** Resend's HTTP API with `fetch` (no SDK), `RESEND_API_KEY`, 5 s timeout. The text
  comes from the product's copy. The log never has the address or the code: only "sent",
  "failed" and the error kind.
- **Rate limits:** `/auth/start` per email hash and per IP (in memory, per warm instance, like
  today; good enough behind the per-email cooldown). `/auth/verify` is bounded by the 5 tries.

## Active users, without knowing who

`daily_counts` gets `active_users` per day: accounts that made at least one `/chat` or
`/supervision` that day.

- On such a request we insert `HMAC(dayKey, user_id)` into `daily_active(day, uid_mac)` with
  "on conflict do nothing". `dayKey = HMAC(METRICS_ID_SECRET, day)`, so the same account gets an
  unrelated value every day: rows of two days can't be joined, and without the secret a row
  can't be matched to an account at all.
- Days before today are rolled up into `daily_counts` (`active_users`, count only) and their
  `daily_active` rows deleted: on the first such request of a new day, and by `GET /admin/stats`.
  Raw rows live at most until the next active day.
- No email, no user id and no invite batch in `daily_counts`. Per case or per language active
  counts aren't kept (they'd need more raw rows); add them later if asked.
- `<5` hiding and the rest of ADR 0007 apply. `METRICS_ID_SECRET` unset: no active-user counts.
- `DELETE /me` needs nothing here: no stored value points back to the account.

## Open questions for review

1. Token life: 30 days fixed, or sliding (renewed when used)? We propose fixed for the demo.
2. When to move to `required`, and what old apps show then (`sign_in_required` is unknown to
   them; they show their generic error).
3. Batch names in `INVITE_CODES` (`code:batch`) or a separate variable?
4. The email text (product, zh and en).
