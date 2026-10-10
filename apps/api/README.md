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
| `INVITE_CODES` | — | Comma-separated. When set, every request but `/health` needs `X-Invite-Code` with one of them. |
| `RATE_LIMIT_MAX` | `30` | `/chat` + `/supervision` requests per key per window. Key: the invite code, else the IP. |
| `RATE_LIMIT_WINDOW_SEC` | `60` | Window length. Over the limit → 429 `rate_limited` with `Retry-After`. |
| `PORT` | `8787` | Local server only. |

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
- AI supervisor: [`prompts/supervisor.md`](./prompts/supervisor.md) + the rubric
  (`content/rubrics/<school>.md`) + a language line. No case text at all (no role brief, no
  title, no summary), so the report rests only on what was said; every quote in it must appear
  word for word in the transcript. The whole transcript goes in as one
  user message, numbered `[1] 咨询师：…` for the model; the report itself carries no numbers.
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
