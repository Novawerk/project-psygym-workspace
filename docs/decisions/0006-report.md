# 0006 — Reporting one AI passage

Date: 2026-10-10. Status: accepted (board D8 = A).

- **Why.** Google Play wants users to be able to report offensive AI content inside the app.
  To act on a report we need to see the passage.
- **What we receive.** Exactly one passage: an AI client reply or a passage of the supervision
  report (`source`), up to 2000 characters, plus a fixed reason, an optional note (≤ 500
  characters), the case id and the language. The app shows the passage before sending. Never
  the counselor's lines, never the rest of the session.
- **A new endpoint, `POST /report`.** Not a flag on `POST /feedback`. `/feedback` keeps a simple
  promise: it never carries conversation text. `/report` is the one place that does, so the
  contract, the code and the privacy copy can each point at a single endpoint.
- **Where it goes.** The same private Slack channel as feedback (`FEEDBACK_SLACK_WEBHOOK_URL`),
  marked as a report, text in plain_text blocks so nothing in it pings anyone. Our server stores
  nothing; Slack keeps the message. Unset webhook or a Slack failure: dropped, `204` anyway.
- **Logs.** Ids, enums and lengths only. Never the passage, the note or the webhook URL.
- **Who reads them.** Two members we name, within a week (see `safety.md` §1 and board D8). How
  a report turns into a prompt change is still to settle with 聆镜.
