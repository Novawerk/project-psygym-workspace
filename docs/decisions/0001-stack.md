# 0001 — Stack

Date: 2026-10-10. Status: accepted.

- **App:** Kotlin Multiplatform + Compose Multiplatform, Android and iOS, the same stack as
  Novawerk's YIMA and Berlin Chinese Food Map: single `composeApp` module, kotlin-inject,
  DataStore, Ktor client (SSE plugin), kotlinx.serialization, Navigation Compose, EN/ZH
  strings in `composeResources`. Markdown via `multiplatform-markdown-renderer-m3`. No AI
  SDK on the device, no vendor keys in the app.
- **Backend:** an independent Hono service in `apps/api`, deployed as its own Vercel
  project. Model adapters copied from Novawerk/agent-starter (`apps/agent/src/llm/`):
  `LLM_PROVIDER=anthropic|deepseek|mock`. No agent loop: one streaming call per turn.
- **Contract:** [`docs/api-contract.md`](../api-contract.md).
- **Prompts:** Markdown under `content/` (cases, rubrics) and `apps/api/prompts/`.
