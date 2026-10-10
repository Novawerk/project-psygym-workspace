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
| `INVITE_CODES` | — | Comma-separated. When set, every request but `/health` needs `X-Invite-Code` with one of them. |
| `RATE_LIMIT_MAX` | `30` | `/chat` + `/supervision` requests per key per window. Key: the invite code, else the IP. |
| `RATE_LIMIT_WINDOW_SEC` | `60` | Window length. Over the limit → 429 `rate_limited` with `Retry-After`. |
| `PORT` | `8787` | Local server only. |

A role with no provider, or no key for its provider, answers 503 `model_unavailable`. The
server keeps running, and `/health` and `/cases` still work.

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
  The counselor's messages go in as user turns, the client's as assistant turns.
- AI supervisor: [`prompts/supervisor.md`](./prompts/supervisor.md) + the rubric
  (`content/rubrics/<school>.md`) + the case brief + a language line. The whole transcript goes
  in as one user message, numbered `[1] 咨询师：…`.
- Cases: `content/cases/<id>.md`. Frontmatter `id`, `school`, `title.zh/en`, `summary.zh/en`
  is what `GET /cases` returns; the body is the role brief and stays on the server. See
  [`content/README.md`](../../content/README.md) for the template.

The cases and the rubric in this PR are placeholders, marked as such. Our psychologists'
versions replace them (issues #1, #2).

The model adapters in `src/llm/` are copied from
[Novawerk/agent-starter](https://github.com/Novawerk/agent-starter) (MIT); each file says so.

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
- The rate limit lives in each instance's memory. On Vercel that means "per warm instance": a
  brake, not a guarantee. Fine for an invite-only demo.
