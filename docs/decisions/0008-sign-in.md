# 0008 — Sign-in by email code

Date: 2026-10-11. Status: **accepted**; built behind `AUTH_MODE` (off by default). The product
spec is [`product/login.md`](../product/login.md); the contract part is in
[`api-contract.md`](../api-contract.md#sign-in). Backend and product agreed the details together
(2026-10-11).

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
- **Races:** a try is taken before the comparison, in one statement (`UPDATE … SET tries_left =
  tries_left - 1 WHERE tries_left > 0 AND expires_at > now RETURNING`), so concurrent guesses
  can't share one; the code is used up with `DELETE … RETURNING`, so only one right answer gets a
  session; the per-email send limits are one conditional upsert. `rate_counters` has an index on
  `window_start`, swept when a key opens a new hour.
- **Codes:** 6 digits, 10 minutes, 5 tries, one per email. `code_mac` = HMAC-SHA256 with a
  server key (`AUTH_SECRET`), so a leaked table doesn't give codes away by trying all 10⁶.
  `verify` without an invite code for a new email doesn't use a try or the code (the app shows
  L3 and sends the same code again); a wrong invite code uses a try.
- **Limits, all counted in the database** (so they hold across Vercel instances; the in-memory
  limiter of today stays for `/chat` and the rest):
  - `start`: one per email per 60 s and 5 per email per hour (from `login_codes`); 20 per IP per
    hour.
  - `verify`: 30 per IP per hour, on top of the 5 tries per code.
  - Table `rate_counters(key_mac, window_start, count)`: `key_mac` = HMAC(`AUTH_SECRET`,
    `"ip:" + ip` or `"verify-ip:" + ip`), one row per key and hour, deleted when its hour is
    over (swept on the next write). No IP is stored in the clear.
- **Timing:** `start` answers `202` before it looks anything up that depends on the account, and
  sends the email after the answer with `waitUntil` from `@vercel/functions` (as the counts in
  #62 do), so the response time doesn't tell whether the email has an account. A failed send is
  a log line; the user taps "send again".
- **Invite codes against guessing:**
  - A code that creates accounts is at least 12 random characters from an alphabet without
    look-alikes (e.g. 23456789abcdefghjkmnpqrstuvwxyz), about 60 bits. The server refuses
    shorter ones for sign-up (a config error at start, like #62's). The codes live today are 6
    hex characters: they keep working as `X-Invite-Code` for old apps while `optional` lasts,
    but sign-up needs new codes, and they are replaced before `required` (see Going live).
  - Every wrong invite code at `verify` uses one of the code's 5 tries, counts against the
    per-IP `verify` limit, and adds to a global counter (`rate_counters`, key `"invite-wrong"`,
    per hour). Past 20 in an hour the server posts one alert to the team's Slack channel
    (`FEEDBACK_SLACK_WEBHOOK_URL`, the #psygym-feedback channel): "N wrong invite codes in the
    last hour". At most one alert per hour. No email, no IP, no code in it.
- **Invite batches:** `INVITE_CODES` may name batches (`code:batch`, e.g.
  `k7m2q9x4h8wd:lingjing-pilot-1`). A new account stores the batch name, never the code. A code
  without a name gets batch `default`. The batch is only on the account; it isn't used in counts.
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

The product wants daily and weekly active accounts (overall only; no per-batch counts). An
account is active on a day when one of its `/chat` or `/supervision` requests that day ends
well (`turn_end`).

- **Two keys that rotate.** From `METRICS_ID_SECRET`:
  `dayKey = HMAC(secret, "day:" + date)` and `weekKey = HMAC(secret, "week:" + ISO week)`.
  The pseudonym is `HMAC(dayKey, user_id)` in `active_day(day, pid)` and
  `HMAC(weekKey, user_id)` in `active_week(week, pid)`, each inserted with "on
  conflict do nothing". The same account gets an unrelated pseudonym every day and every week:
  rows of different days, or of different weeks, can't be joined, and none can be tied to an
  account without the secret. A day row and a week row of the same account can't be joined
  either (different keys).
- **Rolled up, then deleted.** A finished day becomes `active_day` counts in `daily_counts`
  (one number, dim `""`), and its `active_day` rows are deleted.
  A finished ISO week becomes `active_week` counts (on the week's Sunday), and its rows are
  deleted. Raw rows live at most until the next request after their day or week ends. The
  roll-up runs on the first request of a new day and from `GET /admin/stats`.
- **Weekly means the ISO week** (Monday to Sunday), not a rolling 7 days: a rolling window would
  need to link days, which the rotating key prevents on purpose.
- `daily_counts` never holds a pseudonym, an account id, an email or an invite code.
- **Small numbers:** `<5` hiding and the rest of ADR 0007 apply.
- **Deleting an account:** for every day and ISO week still in the detail tables (not rolled up
  yet), we compute the account's pseudonym and delete that row. Totals already rolled up stay.
- **Not counted:** the reviewer account. `METRICS_ID_SECRET` unset: no active counts at all.

## Deleting an account without the app

Google Play asks for a way to request deletion on the web: the page
`novawerk.io/psygym/delete-account` (as in `product/login.md`; built in `apps/web` of the
Novawerk site, assigned by the lead). It says: delete in the app (Me → Delete account); if you
can't, email `info@novawerk.io` from the account's address. We confirm by replying to that
address, then delete within 30 days with an admin call:

- `POST /admin/accounts/delete { email }`, `Authorization: Bearer <ADMIN_TOKEN>` (a token of its
  own, not the stats token). It does exactly what `DELETE /me` does. It answers `204` whether or
  not the email had an account. The log keeps neither the email nor a hash of it (an unsalted
  hash of an email can be looked up), only whether an account was found.

## Going live (operations)

1. Migrate (by hand, as in #62), set `AUTH_SECRET`, `METRICS_ID_SECRET`, `RESEND_API_KEY` (the
   user, by clipboard), `ADMIN_TOKEN`.
2. New invite codes for sign-up: at least 12 random characters, named by batch, added to
   `INVITE_CODES` next to the old ones.
3. `AUTH_MODE=on` with the signed-in app. `optional` lasts until `AUTH_REQUIRED_FROM`.
4. Before `AUTH_REQUIRED_FROM`: remove the old 6-character codes from `INVITE_CODES`.
5. Store review: set `REVIEW_LOGIN_EMAIL` and a new `REVIEW_LOGIN_CODE` before each submission;
   **clear both the moment the review is over**: the fixed code has no try limit (only the per-IP
   limit), so it must not outlive the review. The reviewer's requests are never counted.

## Open questions for review

1. The threshold for the wrong-invite alert (20 an hour) and whether it should also pause sign-up.
