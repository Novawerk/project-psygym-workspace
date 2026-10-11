# 0007 — Anonymous daily counts

Date: 2026-10-11. Status: accepted (board D-A6 = B, D-A7 = A, D-A4 = B; D-A1 still open).

**Partly superseded by [0008](./0008-sign-in.md)** (once sign-in is on): "no id of any kind" no
longer holds; 0008 adds pseudonymous active-account records that rotate daily and weekly.

- **What.** One table, `daily_counts`: day (UTC) × event × case × language × one extra
  dimension, and a count. For reports, also the sum of session lengths and how many sessions
  sent one. Nothing else: no events one by one, no text, no invite code, no IP, no id of any
  kind. We know how often things happen, not who did them.
- **Events.**

  | Event | When |
  |---|---|
  | `session_started` | a `/chat` turn ends well and the conversation has exactly one counselor line. `/chat` is stateless; the counselor's first line is the start, whoever spoke first. A failed first turn that the app retries counts once, when it works. |
  | `chat_turn` | a `/chat` turn ends with `turn_end` |
  | `session_ended_by_client` | a `/chat` turn carries `session_end` (a repeat after the end counts again; the app locks the input, so this is rare) |
  | `report_generated` | a `/supervision` stream ends with `turn_end`; dim = turns in the session (1–5, 6–15, 16–30, 31+); duration from `durationSec` |
  | `report_failed` | a `/supervision` stream (the final report) ends with an error frame |
  | `live_supervision` | a `/supervision` stream with `mode: "live"` ends with `turn_end`; dim = turns so far (1–5, 6–15, 16–30, 31+). A failed one is only `error`/`stream_error`; it never counts as a report or a duration. |
  | `session_duration` | with `report_generated`, when the app sent `durationSec`; dim = 0–5, 5–10, 10–20, 20–40, 40+ minutes |
  | `feedback` | `/feedback`; dim = up / down |
  | `user_report` | `/report`; dim = reason |
  | `error` | dim = error code: `invalid_request`, `case_not_found`, `model_unavailable`, `stream_error`, `internal`. No case, no language. Not `invite_required` or `rate_limited`: a 401 comes before the rate limit and a 429 comes from it, so counting them would let anyone make us write to the database without end. |

  A client that disconnects mid-stream isn't counted. Before anything is stored, a case id
  outside the known cases and a language other than zh/en become `unknown`.
- **Cold start.** With counting off, nothing loads drizzle-orm or pg: the counting code the app
  always imports (`metrics/counter.ts`) has no database code, and `metrics/db.ts` is a dynamic
  import made only when counting is on (a test checks this in a fresh process).
- **Fire and forget.** Each count is one upsert (`count + 1`), started after the frame or the
  answer it counts, kept alive on Vercel with `waitUntil`. A failed write is one log line with
  the error's kind; the request never waits on it and never fails because of it. Connect, query
  and statement time out after 2 s; `attachDatabasePool` closes idle clients on Vercel.
- **On only on purpose.** `METRICS_ENABLED=true` and a `DATABASE_URL`, or nothing is written.
- **Store.** Postgres (Neon, Frankfurt) through Drizzle and node-postgres. Migrations in
  `apps/api/drizzle/`, made with drizzle-kit, run by hand, never at deploy.
- **Reading.** `GET /admin/stats` with `Authorization: Bearer <ADMIN_STATS_TOKEN>` (compared as
  sha256 hashes in constant time). Any cell under 5 shows `<5`, and so does any total under 5.
  Within each event × dimension we never hide just one cell: if only one is under 5, the next
  smallest is hidden too, or the total minus the rest would give it away. Durations follow the
  same rules.
- **Limit we accept.** The hiding holds within one response. Asking for different `from`/`to`
  ranges and subtracting the results can still reveal a hidden cell. The endpoint is for us
  (Novawerk and 聆镜) only, behind a token, so we accept that.
- **Not yet.** Counting by invite code (D-A1): no invite code is stored until that is decided.
- **Where this differs from `docs/product/admin.md`, on purpose:**
  - One table, not two. Durations are two columns on the `report_generated` row (sum and number
    of sessions) plus a `session_duration` event for the five buckets, instead of a separate
    `daily_durations` table. Same information, one upsert path, one migration.
  - "Session started" counts the turn that answers the counselor's first line and ends well, not
    every `/chat` request with exactly one message: the client may speak first, and a failed
    first turn that the app retries should count once.
  - `invite_required` and `rate_limited` aren't counted (see `error` above).
- **Contract.** `durationSec` changed the contract in the backend PR only (#62); the app sends
  it in a later PR. The lead allowed this exception: the field is optional and old apps work
  unchanged.
