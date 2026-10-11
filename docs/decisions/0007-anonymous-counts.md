# 0007 — Anonymous daily counts

Date: 2026-10-11. Status: accepted (board D-A6 = B, D-A7 = A, D-A4 = B; D-A1 still open).

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
  | `report_failed` | a `/supervision` stream ends with an error frame |
  | `feedback` | `/feedback`; dim = up / down |
  | `user_report` | `/report`; dim = reason |
  | `error` | dim = error code: `invite_required`, `rate_limited`, `invalid_request`, `case_not_found`, `model_unavailable`, `stream_error`, `internal`. No case, no language. |

  A client that disconnects mid-stream isn't counted. Before anything is stored, a case id
  outside the known cases and a language other than zh/en become `unknown`.
- **Fire and forget.** Each count is one upsert (`count + 1`), started after the frame or the
  answer it counts, kept alive on Vercel with `waitUntil`. A failed write is one log line with
  the error's kind; the request never waits on it and never fails because of it.
- **On only on purpose.** `METRICS_ENABLED=true` and a `DATABASE_URL`, or nothing is written.
- **Store.** Postgres (Neon, Frankfurt) through Drizzle and node-postgres. Migrations in
  `apps/api/drizzle/`, made with drizzle-kit, run by hand, never at deploy.
- **Reading.** `GET /admin/stats` with `Authorization: Bearer <ADMIN_STATS_TOKEN>`. Any cell
  under 5 shows `<5`. Totals over the range stay exact, so within each event × dimension we
  never hide just one cell: if only one is under 5, the next smallest is hidden too, or the
  total minus the rest would give it away. Durations follow the same rule.
- **Not yet.** Counting by invite code (D-A1): no invite code is stored until that is decided.
