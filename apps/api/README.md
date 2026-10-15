# apps/api — 聆镜 PSYGYM backend

A small Hono service. It plays the AI client and the AI supervisor, and streams both to the
app. The app never talks to a model vendor; it talks to us. The contract is
[`docs/api-contract.md`](../../docs/api-contract.md).

- Stateless. The app sends the whole conversation each turn. We store no transcript.
- The log carries case id, locale, message count, tokens and timing. Never message text.
- No agent loop: one streaming model call per request.

## Run it locally

Node 22+, pnpm 10.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # then fill in a key, or set LLM_PROVIDER=mock
pnpm --filter api dev                    # http://localhost:8787
```

No key at hand? `LLM_PROVIDER=mock pnpm --filter api dev` runs the whole flow with canned replies.
Put `#end` in a counselor message and the mock client says goodbye and ends the session
(`session_end`), so you can walk through the locked-input state.

Try it:

```bash
curl -s localhost:8787/health
curl -s localhost:8787/cases
curl -N localhost:8787/chat -H 'Content-Type: application/json' \
  -d '{"caseId":"placeholder-cbt-depression","locale":"zh","messages":[{"role":"counselor","text":"你好，今天想聊点什么？"}]}'
```

You see `data: {"type":"turn_start"}`, then `text_delta` frames, then `turn_end`.

Other scripts: `pnpm --filter api test`, `pnpm --filter api typecheck`, `pnpm --filter api build`
(→ `dist/`), `pnpm --filter api start` (runs `dist/server.js`).

## Environment

Blank values count as unset. `apps/api/.env` is read on start; shell variables win.

| Variable | Default | What |
|----------|---------|------|
| `LLM_PROVIDER` | — | `deepseek` (demo), `anthropic` or `mock`. Unset → chat and supervision answer 503 `model_unavailable`. |
| `LLM_MODEL` | per provider | `deepseek-chat` for DeepSeek, `claude-sonnet-5-5` for Anthropic. Applies to `LLM_PROVIDER` only. |
| `LLM_BASE_URL` | per provider | `https://api.deepseek.com` for DeepSeek. Applies to `LLM_PROVIDER` only. |
| `DEEPSEEK_API_KEY` | — | Needed when a role uses DeepSeek. |
| `ANTHROPIC_API_KEY` | — | Needed when a role uses Anthropic. |
| `LLM_MAX_OUTPUT_TOKENS` | per provider | Cap on one reply. |
| `ANTHROPIC_EFFORT` | `medium` | Anthropic only: `low` … `max`. |
| `CLIENT_LLM_PROVIDER` / `_MODEL` / `_BASE_URL` | — | Override for the AI client. |
| `SUPERVISOR_LLM_PROVIDER` / `_MODEL` / `_BASE_URL` | — | Override for the AI supervisor. |
| `INVITE_CODES` | — | Comma-separated, each `code` or `code:batch`. Codes of 12+ characters also let a new account sign up (sign-in on). When set, every request but `/health` needs `X-Invite-Code` with one of them. |
| `RATE_LIMIT_MAX` | `30` | `/chat` + `/supervision` requests per key per window; `/feedback` and `/report` each have their own bucket of the same size. Key: the invite code, else the IP. |
| `RATE_LIMIT_WINDOW_SEC` | `60` | Window length. Over the limit → 429 `rate_limited` with `Retry-After`. |
| `FEEDBACK_SLACK_WEBHOOK_URL` | — | Slack incoming webhook (https) for `POST /feedback` and `POST /report`. Unset → feedback and reports are dropped (still 204) with a `feedback dropped: not configured` / `report dropped: not configured` log line. |
| `END_SESSION_JUDGE` | off | `on`: the AI client's `end_session` ends the session only if an independent check (the supervisor model, 4 s timeout) finds 2 harmful counselor messages; otherwise the closing line is dropped (what came before it stays; if nothing did, the client answers once more without the tool, and a closing line there becomes a neutral line). `/chat` replies go out one finished sentence at a time; from the first sentence that reads like a closing line, the rest is held until the turn ends. Off: the stream is exactly as before. See `src/end-judge.ts`. |
| `METRICS_ENABLED` | off | `true` turns on the anonymous daily counts. Needs `DATABASE_URL` too, or it stays off. |
| `DATABASE_URL` | — | Postgres for the counts (Neon Frankfurt; Vercel injects it). |
| `DATABASE_URL_UNPOOLED` | — | Neon's direct URL; only `db:migrate` uses it (falls back to `DATABASE_URL`). |
| `ADMIN_STATS_TOKEN` | — | Bearer token for `GET /admin/stats`. Unset → the endpoint answers 404. |
| `AUTH_MODE` | `off` | `on` turns sign-in on (needs `DATABASE_URL` and `AUTH_SECRET`). Off: nothing changes, no auth code loads. |
| `AUTH_REQUIRED_FROM` | — | UTC date-time (ISO 8601). From then on a request needs a session token (`426 update_required` without). Unset: `optional`. |
| `AUTH_SECRET` | — | 32+ characters. Key for code MACs and rate-counter keys. |
| `METRICS_ID_SECRET` | — | 32+ characters. Key for the pseudonymous active-account records. Unset: no active counts. |
| `RESEND_API_KEY` | — | Sends the code email. Unset: no email (a log line says so). |
| `AUTH_EMAIL_FROM` | `聆镜 PSYGYM <no-reply@novawerk.io>` | The code email's sender. |
| `REVIEW_LOGIN_EMAIL`, `REVIEW_LOGIN_CODE` | — | The store reviewer: one address, one fixed 6-digit code. Clear both after review. |
| `ADMIN_TOKEN` | — | Bearer token for `POST /admin/accounts/delete`. Unset → 404. |
| `ADMIN_MODE` | `off` | `on` turns the admin routes on (`docs/admin-api.md`; needs `DATABASE_URL`, `ADMIN_GOOGLE_CLIENT_ID`, `ADMIN_ORIGIN`, else it stays off with a config error). The admin code loads on the first `/admin` request. |
| `ADMIN_GOOGLE_CLIENT_ID` | — | The admin page's Google OAuth client id (not a secret). |
| `ADMIN_ORIGIN` | — | The admin page's origin, e.g. `https://admin.psygym.novawerk.io`. Admin writes must carry it as `Origin`. |
| `CONTENT_SOURCE` | `files` | `db`: cases and rubrics come from the published versions in the database (cached 1 minute; fallback: the last good copy, then the bundled `content/`). |
| `CONTENT_SLACK_WEBHOOK_URL` | — | Slack incoming webhook (https) for `#project-psygym`: one line per publish or rollback. Unset → log only. |
| `PORT` | `8787` | Local server only. Port 8787 is often taken by another project on our machines; pick a free one (`PORT=8790`). |

A role with no provider, or no key for its provider, answers 503 `model_unavailable`. So does
a misspelt provider (`LLM_PROVIDER=claude`): the start-up log prints one `config error` line
naming the variable, never its value. Other invalid values (say `RATE_LIMIT_MAX=lots`) fall
back to their default, with the same log line. The server keeps running, and `/health` and
`/cases` still work.

## Switching models

Everything on DeepSeek (the demo):

```bash
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=…
```

Client on DeepSeek, supervisor on Claude:

```bash
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=…
SUPERVISOR_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=…
# SUPERVISOR_LLM_MODEL=claude-sonnet-5-5   (the default)
```

A role overridden onto another provider uses that provider's default model and URL, unless
you set `CLIENT_LLM_MODEL` / `SUPERVISOR_LLM_MODEL` (and `_BASE_URL`).

## What the model sees

- AI client: [`prompts/client.md`](./prompts/client.md) + the case brief + a language line.
  The counselor's messages go in as user turns, the client's as assistant turns. It has one
  tool, `end_session` (no arguments). When the rules say the session is over (harmful remarks,
  second time), it says its closing line and calls the tool. We turn the call into one
  `session_end` frame before `turn_end`; the call itself never reaches the app. If the model
  calls it without a closing line, we send one ("我想今天先到这里。" / "I'd like to stop here
  for today."). If the app sends more after that, the client answers in one short line and
  the stream carries `session_end` again.
- A turn with no text to show (and no `end_session`) ends with an `error` frame
  (`model_unavailable`), so the app offers a retry instead of an empty bubble.
- Mid-session notes (`/supervision` with `mode: "live"`): [`prompts/supervisor-live.md`](./prompts/supervisor-live.md)
  + the rubric + a language line, with the conversation so far. No headings, 1–3 items, no AI
  line. The mock answers with notes in the same shape.
- AI supervisor: [`prompts/supervisor.md`](./prompts/supervisor.md) + the rubric
  (`content/rubrics/<school>.md`) + a language line. No case text at all (no role brief, no
  title, no summary), so the report rests only on what was said; every quote in it must appear
  word for word in the transcript. The whole transcript goes in as one
  user message, numbered `[1] 咨询师：…` for the model; the report itself carries no numbers.
  When the counselor wrote 15 or more messages, the server also adds a one-sentence "intake
  decision" reminder rule for "What to practise next" (a placeholder until 聆镜's standard;
  `src/session.ts`). The server counts, not the model.
  Temperature 0.3 where the model accepts it (DeepSeek yes; current Claude models reject
  sampling parameters, so we leave it out there).
- Cases: `content/cases/<id>.md`. Frontmatter `id`, `school`, `title.zh/en`, `summary.zh/en`
  (required) and `tags`, `difficulty`, `estimatedMinutes`, `clientIntro`, `practiceFocus`,
  `contentNotes` (optional) are what `GET /cases` returns; the body is the role brief and stays on
  the server. A bad optional field is left out with a `case warning` log line; the case still
  loads. A bad required field stops the server from starting, so the tests catch it first. See
  [`content/README.md`](../../content/README.md) for the template.

The cases and the rubric in this PR are placeholders, marked as such. Our psychologists'
versions replace them (issues #1, #2).

The model adapters in `src/llm/` are copied from
[Novawerk/agent-starter](https://github.com/Novawerk/agent-starter) (MIT); each file says so.

## Report feedback

`POST /feedback` takes a thumbs up or down on a report and an optional comment (≤ 500
characters). The conversation is never a field, though a user can paste text into the comment
themselves. We forward it to a private Slack channel: case id, language, rating, comment (as
plain text, so @here or links in it do nothing), time. Our server stores nothing; Slack keeps
the message in that private channel. The log carries the case id, language,
rating and the comment's length, never its text. If Slack fails, the app still gets `204`
and we log `feedback dropped: slack error`.

## Reports

`POST /report` lets a user report one AI passage (a client reply or part of a report) with a
reason and an optional note. It's the only request whose conversation text we pass on: the
passage (≤ 2000 characters) goes to the same private Slack channel as feedback, marked as a
report, in plain_text. Our server stores nothing; Slack keeps the message. The log has ids,
reasons and lengths only. See [`docs/decisions/0006-report.md`](../../docs/decisions/0006-report.md).

## Sign-in

Email and a one-time code, behind `AUTH_MODE` (off by default: the server behaves as before and a
cold start loads no auth code). The contract is the Sign-in section of
[`docs/api-contract.md`](../../docs/api-contract.md#sign-in); decisions and storage in
[`docs/decisions/0008-sign-in.md`](../../docs/decisions/0008-sign-in.md).

- `POST /auth/start`, `POST /auth/verify` (with `inviteCode` for a new account),
  `POST /auth/logout`, `GET /me`, `DELETE /me`; `POST /admin/accounts/delete` for us.
- We keep the email, the sign-up time, the invite batch and sessions (90 days from the last
  use). Codes, tokens and IPs only as MACs or hashes. The log never has an email, a code, a token
  or an IP.
- With counting on too, active accounts per day and per ISO week, through pseudonyms that change
  every day and every week; rolled up into `daily_counts` (`active_day`, `active_week`) and
  deleted when the day or week is over.

Locally, with the throwaway Postgres from "Anonymous counts" (migrated), and no Resend key, use
the reviewer address to sign in:

```bash
LLM_PROVIDER=mock AUTH_MODE=on DATABASE_URL=postgres://psygym:psygym@127.0.0.1:55432/psygym \
  AUTH_SECRET=$(openssl rand -hex 32) REVIEW_LOGIN_EMAIL=review@example.com REVIEW_LOGIN_CODE=246810 \
  PORT=8790 pnpm dev
curl -s localhost:8790/auth/verify -H 'Content-Type: application/json' -d '{"email":"review@example.com","code":"246810"}'
```

### Going live with sign-in

1. Migrate (adds `drizzle/0001_sign_in.sql`), as in "Going live (once)" below.
2. Set (Production): `AUTH_SECRET` and `METRICS_ID_SECRET` (each `openssl rand -hex 32`),
   `RESEND_API_KEY`, `ADMIN_TOKEN`; new sign-up invite codes in `INVITE_CODES` (12+ random
   characters, `code:batch`), next to the old ones.
3. When the signed-in build goes to store review: `AUTH_MODE=on` and `REVIEW_LOGIN_EMAIL` with a
   new `REVIEW_LOGIN_CODE`; redeploy. The start-up log says `{"msg":"sign-in","enabled":true}`;
   `/health` says `"auth":"optional"`. Keep the old codes: builds without sign-in still in
   review or with testers use them.
4. No grace period: once the signed-in build has passed review and replaced the old one in both
   stores, set `AUTH_REQUIRED_FROM` to that moment and remove the old 6-character codes. Not
   earlier, or an old build in review gets `426` and its reviewer is locked out.
5. **Clear `REVIEW_LOGIN_EMAIL` and `REVIEW_LOGIN_CODE` the moment the review is over** (the fixed
   code has no try limit, only the per-IP one). The reviewer's requests are never counted.

## Anonymous counts

With `METRICS_ENABLED=true` and a `DATABASE_URL`, the server counts per day (UTC), case and
language: sessions started, chat turns, sessions the client ended, mid-session notes (by turns),
reports (by turns, with the
session length the app sends as `durationSec`, also in five length buckets), failed reports,
👍/👎, reports by reason, and errors by code (not 401 or 429: anyone could trigger those). One table, `daily_counts`; no text, no invite code, no IP, no id of any kind.
Writes are fire and forget: a failed write is one `count failed` log line, the request goes on.
See [`docs/decisions/0007-anonymous-counts.md`](../../docs/decisions/0007-anonymous-counts.md).

Read them with:

```bash
curl -s https://psygym-api.novawerk.io/admin/stats -H "Authorization: Bearer $ADMIN_STATS_TOKEN"
curl -s "https://psygym-api.novawerk.io/admin/stats?from=2026-10-12&to=2026-10-18" -H "Authorization: Bearer $ADMIN_STATS_TOKEN"
```

`cells` are day × case × language × event × dimension; `totals` are per event and dimension
over the range. Any cell or total under 5 shows `"<5"`, and if only one cell in a group is
under 5, the next smallest is hidden too. This holds within one response; subtracting
different ranges can still reveal a cell (ADR 0007). Default range: the last 30 days; at most
366 days.

With counting off (the default), a cold start loads no database code at all.

Locally, against a throwaway Postgres (Docker) on a free port:

```bash
docker run -d --rm --name psygym-pg -e POSTGRES_USER=psygym -e POSTGRES_PASSWORD=psygym -e POSTGRES_DB=psygym -p 55432:5432 postgres:17-alpine
cd apps/api
DATABASE_URL=postgres://psygym:psygym@127.0.0.1:55432/psygym pnpm db:migrate
LLM_PROVIDER=mock METRICS_ENABLED=true DATABASE_URL=postgres://psygym:psygym@127.0.0.1:55432/psygym ADMIN_STATS_TOKEN=local PORT=8790 pnpm dev
```

The tests use PGlite with the same migrations; no database needed for `pnpm test`.

### Changing the table

Edit `src/metrics/schema.ts`, then `pnpm db:generate` (no database needed) and commit the new
file in `drizzle/`.
Migrations never run at deploy; run them by hand (below) before the code that needs them.

### Going live (once)

1. **Database.** Vercel → psygym-api → Storage → Neon, region Frankfurt, Production. Vercel
   injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
2. **Migrate** (by hand, never at deploy), from `apps/api`, with the Vercel CLI logged in:

   ```bash
   vercel env run -e production --project psygym-api --scope novawerk -- pnpm db:migrate:prod
   ```

   Nothing is written to disk: the CLI hands the production variables to that one command.
   `db:migrate:prod` sets `MIGRATE_TARGET=production`, and then the config accepts only
   `DATABASE_URL_UNPOOLED` (Neon's direct connection); it never falls back to the pooled
   `DATABASE_URL`. Running it twice is safe: drizzle-kit skips what's applied.

   **If it stops with "DATABASE_URL_UNPOOLED is empty"** (a variable marked Sensitive can't be
   read back by the CLI): open Vercel → psygym-api → Storage → psygym-db → Open in Neon →
   Connect, turn connection pooling off, copy the connection string, then:

   ```bash
   read -rs DATABASE_URL_UNPOOLED && export DATABASE_URL_UNPOOLED   # paste, Enter: not shown, not in history
   pnpm db:migrate:prod
   unset DATABASE_URL_UNPOOLED
   ```

3. **Token.** Set `ADMIN_STATS_TOKEN` (Production) to a long random string, e.g.
   `openssl rand -base64 32`.
4. **Switch on.** Set `METRICS_ENABLED=true` (Production) and redeploy. The start-up log says
   `{"msg":"metrics","enabled":true}`.
5. **Check.** Use the app once, then `GET /admin/stats` with the token: a `session_started`
   cell for today. No `count failed` lines in the log.

To switch off: remove `METRICS_ENABLED` (or set it to `false`) and redeploy. Nothing else
changes; the table stays.

## Admin (phase 1)

Google sign-in, a dashboard, and cases and rubrics edited and published in the database.
Contract: [`docs/admin-api.md`](../../docs/admin-api.md); decisions:
[ADR 0009](../../docs/decisions/0009-admin-phase1.md). Both switches (`ADMIN_MODE`,
`CONTENT_SOURCE`) are off by default; off, nothing changes and no admin code loads.

- `src/admin/`: routes (`index.ts`), Google token check (`google.ts`), tables (`schema.ts`).
- `src/content-doc.ts`: the checks every case and rubric source passes (shared with the loader).
- `src/content-source.ts`, `src/content-db.ts`: how the app reads the published versions.
- `src/metrics/dashboard.ts`: `GET /admin/dashboard`, filtered, summed and hidden.

Commands (the lead runs them with the production env, like migrations):

```bash
pnpm --filter api admin:add --email <email> --role admin --org novawerk
pnpm --filter api admin:disable --email <email>
pnpm --filter api content:import
pnpm --filter api content:export
```

### Switch-over day

1. Merge or close every open PR that touches `content/cases/` or `content/rubrics/`.
2. Migrate (`0002_admin`, adds tables only), then deploy.
3. `admin:add` the first admin. Set `ADMIN_GOOGLE_CLIENT_ID`, `ADMIN_ORIGIN`,
   `CONTENT_SLACK_WEBHOOK_URL` (by clipboard), then `ADMIN_MODE=on`.
4. `content:import`; look at the cases and the rubric in the admin.
5. Set `CONTENT_SOURCE=db`. Check: publish a small change, `/cases` shows it within a minute,
   and `#project-psygym` gets one line.
6. Same day: `content/README.md` and `docs/for-psygym-team.md` say that cases and rubrics are now
   edited in the admin.

After each publish, until the GitHub sync (phase 2): `content:export` and a PR.

## Deploy (Vercel)

The Vercel project is `psygym-api` (team novawerk), root directory `apps/api`, region `fra1`,
domain `https://psygym-api.novawerk.io`. The lead deploys and sets the environment variables.

- `vercel.json`: build with `pnpm build` (tsup → `dist/`), rewrite every path to the one
  function `api/index.js`, `maxDuration` 300 s so a long report doesn't get cut off.
- `api/index.js` serves the bundle with `hono/vercel`. Vercel runs plain JavaScript; it never
  compiles our TypeScript.
- The build copies `prompts/` and `content/{cases,rubrics}` into `dist/`. It reads
  `../../content`, so keep "Include files outside the root directory" on (Vercel's default).
- Streams: responses carry `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`,
  and a `: ping` comment every 15 s keeps idle connections open.
- Request bodies over 1 MB get 400 `invalid_request`. We read the rest of the body and drop it
  (up to 16 MB), so the client finishes sending and its keep-alive connection stays usable.
- The rate limit lives in each instance's memory, at most 10 000 keys. On Vercel that means "per warm instance": a
  brake, not a guarantee. Fine for an invite-only demo.
