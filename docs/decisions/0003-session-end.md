# 0003 — The AI client can end the session

Date: 2026-10-10. Status: accepted.

- **Why.** [`safety.md`](../safety.md) §3: the second time a counselor says something clearly
  harmful, the AI client ends the session in character. The app must then lock the input, so it
  needs a signal it can trust, not a guess from the text.
- **How.** `/chat` gives the model one tool, `end_session`, with no arguments. The client says
  its closing line, then calls it. The server turns the call into one `session_end` frame, right
  before `turn_end` ([`api-contract.md`](../api-contract.md)). The tool call never reaches the app.
- **Still stateless.** The server doesn't remember that a session ended. If the app sends another
  message anyway, the model sees the whole conversation, answers in one short line and calls
  `end_session` again, so that stream carries `session_end` too. This repeat is best effort: real
  DeepSeek runs miss it now and then (2026-10-10). The app goes by the first `session_end`.
- **Never an empty turn.** A tool call without a closing line gets one from the server. A turn
  with no text and no `end_session` (e.g. only an unknown tool call) ends with an `error` frame,
  so the app offers a retry instead of showing an empty bubble.
- **Counting stays with the model.** The threshold (now 2) is a constant in
  `apps/api/prompts/client.md`. No server-side counter: it would need state or a classifier.
- **Forward compatible.** The app ignores frame types it doesn't know.
