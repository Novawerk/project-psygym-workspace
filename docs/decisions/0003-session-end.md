# 0003 — The AI client can end the session

Date: 2026-10-10. Status: accepted.

- **Why.** [`safety.md`](../safety.md) §3: the second time a counselor says something clearly
  harmful, the AI client ends the session in character. The app must then lock the input, so it
  needs a signal it can trust, not a guess from the text.
- **How.** `/chat` gives the model one tool, `end_session`, with no arguments. The client says
  its closing line, then calls it. The server turns the call into one `session_end` frame, right
  before `turn_end` ([`api-contract.md`](../api-contract.md)). The tool call never reaches the app.
- **Still stateless.** The server doesn't remember that a session ended. If the app sends another
  message anyway, the model sees the whole conversation and answers in one short line.
- **Counting stays with the model.** The threshold (now 2) is a constant in
  `apps/api/prompts/client.md`. No server-side counter: it would need state or a classifier.
- **Forward compatible.** The app ignores frame types it doesn't know.
