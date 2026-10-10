# 0002 — Backend shape

Date: 2026-10-10. Status: accepted.

- **One request, one model call.** `/chat` and `/supervision` each make one streaming call.
  No tools, no agent loop, no memory on the server.
- **Per-role models.** The AI client and the AI supervisor can run on different providers
  (`CLIENT_LLM_*`, `SUPERVISOR_LLM_*`). The demo runs both on DeepSeek; we may move the
  supervisor to Claude later.
- **Missing config is a 503, not a crash.** A role without a provider or key answers
  `model_unavailable`; the rest of the API keeps working.
- **Content is read at runtime.** Cases, the rubric and prompts are Markdown files, copied into
  the build. Psychologists can change them without touching code.
- **Harmful-content threshold lives in the prompt.** `apps/api/prompts/client.md` has one
  constant (now 2). Change the number there once 聆镜 decides.
- **Rate limit in memory.** Per warm instance on Vercel. Good enough behind invite codes. If
  abuse shows up, we move it to Vercel Firewall or a store.
