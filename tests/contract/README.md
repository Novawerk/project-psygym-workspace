# Contract tests

Black-box tests for [`docs/api-contract.md`](../../docs/api-contract.md). They only speak
HTTP, so they run against any backend: local, preview or staging. Vitest and native
`fetch`; the SSE reader is ours (`src/sse.ts`), about 100 lines.

## Run

From the repo root, against a server you started yourself on a free port (here 8790):

```bash
PORT=8790 LLM_PROVIDER=mock RATE_LIMIT_MAX=1000 pnpm --filter api dev
BASE_URL=http://localhost:8790 pnpm test:contract
```

`BASE_URL` has no default. Without it the run stops before sending anything: port 8787 on
our machines is often another project's dev server, and the suite must never hit it by
accident. The unit tests need no server: `pnpm --filter @psygym/contract-tests test:unit`.

Never point this at production, and never at a server with `FEEDBACK_SLACK_WEBHOOK_URL` set: the `/feedback` and `/report` tests would post to the team's Slack channel. `apps/api` also reads `apps/api/.env` at start, so that file must not set it either. The suite sends real `/chat` and `/supervision`
requests; with a real model they cost tokens. Prefer a server running `LLM_PROVIDER=mock`.

| Variable | Default | What |
|---|---|---|
| `BASE_URL` | none, required | Server under test. Unset: the run stops with "请设置 BASE_URL". |
| `INVITE_CODE` | unset | A valid code. Set it when the server has `INVITE_CODES`; the 401 tests run then. Unset: we check that any code (or none) passes. |
| `CASE_ID` | first of `GET /cases` | Case used for `/chat` and `/supervision`. |
| `EXPECT_MODEL_UNAVAILABLE` | unset | `1` when the server runs with no model. Stream tests are skipped; `503 model_unavailable` is checked instead. |
| `END_TRIGGER` | unset | A counselor line that makes the mock client end the session (`#end` for apps/api with `LLM_PROVIDER=mock`). Set it to run the `session_end` tests; skip it with a real model. |
| `STREAM_TIMEOUT_MS` | `90000` | How long one stream may take. |
| `RATE_LIMIT_BURST` | `150` | Rate-limit test only: requests to send before giving up on a 429. |

The rate-limit test is separate, because it uses up the limiter:

```bash
BASE_URL=http://localhost:8790 pnpm test:contract:rate-limit
```

Other tests wait and retry once on `429` when `Retry-After` is 65 s or less, so a tight
limiter slows the suite down instead of failing it.

## What we check

- `GET /health` → `200 {"ok":true}`.
- `GET /cases` → `{"cases": CaseSummary[]}`, non-empty, unique ids, `school: "cbt"`,
  `zh` and `en` text present, only the contract's public fields (the role brief stays on the
  server), and each optional field well-formed when present.
- `POST /supervision` with `mode`: `final` and `live` both stream a report (`live`: short notes);
  any other value is `400 invalid_request`.
- `POST /supervision` with `durationSec`: a whole number in 0–7200 is taken, anything else is
  ignored; `200` and a full report either way, never `400`.
- `POST /chat`, `POST /supervision`, in `zh` and `en`: `200`, `text/event-stream`, frames
  `turn_start → text_delta* → turn_end | error` and nothing after, data-only, every
  `data:` is JSON, known `type`s only, `usage` numbers when present, non-empty text.
- Limits: exactly 80 messages and a 2000-char message pass; 81 messages and 2001 chars fail.
- `/supervision` accepts a session that ends on the client, or has one line.
- `400 invalid_request` for each broken body we could think of, for a body that is not
  JSON, and for a body of about 1 MB.
- `404 case_not_found`, `401 invite_required` (missing and wrong code),
  `503 model_unavailable`, `429 rate_limited` with `Retry-After` (seconds or HTTP date).
- `POST /feedback`: `204` with no body for up/down, with or without a comment up to 500
  characters; `400` for a bad rating, a 501-character comment, and any extra field
  (`messages` above all); `404` for an unknown case; `401` without a valid code; its own
  rate-limit bucket (rate-limit run only).
- `POST /report`: `204` for each source and reason, `reportedText` of 1 to 2000 characters
  (2000 emoji too); `400` for an empty or 2001-character passage, a bad source or reason, a
  501-character comment, and any extra field (`messages`, `rating`…); `404`; `401`; its own
  rate-limit bucket (rate-limit run only).
- Every pre-stream error is JSON `{ "error": { "code", "message" } }`.

Not checked, because we cannot trigger it from outside: an `error` frame mid-stream, and
the 15-second `: ping`. The frame checker accepts both when they appear.

## Checking the tests themselves

`scripts/reference-server.mjs` is a ~100-line server that follows the contract. It is a
test fixture, not the backend. `pnpm test:contract:self` runs the suite against it four
ways (open, invite codes on, no model, rate limit). If that fails, the tests are wrong.

The same server takes `FAULT=<name>` to fail every request one way, so we can walk the
app through each error state. See [`docs/test-plan.md`](../../docs/test-plan.md).

## AI quality spot check

`pnpm --filter @psygym/contract-tests quality` runs six fixed counselor lines per case,
then one supervision report, and flags what a script can see: the client calling itself an AI, talking about
its prompt, or repeating `apps/api/prompts/client.md` (B1; set `PROMPT_FILE` to point
elsewhere), advice (B2), long or list-shaped replies (B6), a report that quotes
nothing (C2), wrong sections (C1), a missing closing line (C7), an improvement without an
alternative (C4), and the report's shape (G): too long (zh > 650 characters, en > 450 words),
too many items (2 / 3 / 2), numbered items, bold item headings, a quoted alternative. Each call's
time to first text and total time go into the transcript and `SUMMARY.md`. Output goes to `out/`
(not committed). See `docs/test-plan.md`, part 2.

## Rules from the contract worth knowing

The suite checks these, because the contract says so:

- An over-size body answers `400 invalid_request`, never `413`. After that answer the
  next request on the same connection must still work.
- `/health` never checks the invite code.
- Either role may come first. On `/chat` the last message must be the counselor's (else
  400); `/supervision` takes any last message, and a one-line session still gets a report.

## Node version

`pnpm quality` runs TypeScript with `--experimental-strip-types`, so it needs Node 22.6 or
later (Node 23.6+ strips types by default; the flag is still accepted).
