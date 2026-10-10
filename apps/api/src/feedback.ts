// POST /feedback: a thumbs up or down on a supervision report, with an optional comment.
// The conversation is never a field. Our server stores nothing: the feedback goes to a private Slack
// channel through an incoming webhook (FEEDBACK_SLACK_WEBHOOK_URL), where Slack keeps the message,
// or is dropped when that isn't set.
import { z } from "zod";

import { LocaleSchema, type Locale } from "./schema.js";

export const MAX_COMMENT_CHARS = 500;

// Strict: unknown keys (say, `messages`) are a 400, so a conversation can't ride along.
export const FeedbackBody = z.strictObject({
  caseId: z.string().min(1).max(100),
  locale: LocaleSchema,
  rating: z.enum(["up", "down"]),
  comment: z
    .string()
    .trim()
    .refine((s) => [...s].length <= MAX_COMMENT_CHARS, `comment is over ${MAX_COMMENT_CHARS} characters`)
    .optional(),
});
export type Feedback = z.infer<typeof FeedbackBody>;

/** Slack reads &, < and > as markup (<!channel>, links); escape them so a comment stays text. */
const escapeSlack = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The Slack message: case id, language, rating, comment, time. Nothing else.
 * The comment goes in a plain_text block: Slack shows it as typed, so @here, <!channel> or a
 * bare link in it never pings anyone or turns into markup.
 */
export function slackMessage(f: Feedback & { locale: Locale }, at: Date) {
  const rating = f.rating === "up" ? "👍 up" : "👎 down";
  const comment = f.comment || "(no comment)";
  const when = at.toISOString();
  const caseId = escapeSlack(f.caseId);
  return {
    text: `Report feedback ${rating} · ${caseId} · ${f.locale}`,
    blocks: [
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Case*\n\`${caseId}\`` },
          { type: "mrkdwn", text: `*Language*\n${f.locale}` },
          { type: "mrkdwn", text: `*Rating*\n${rating}` },
          { type: "mrkdwn", text: `*Time*\n${when}` },
        ],
      },
      { type: "section", text: { type: "mrkdwn", text: "*Comment*" } },
      { type: "section", text: { type: "plain_text", text: comment, emoji: false } },
    ],
  };
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Posts to the webhook. Resolves with the HTTP status, or throws on a network error or timeout. */
export async function postToSlack(fetchFn: FetchLike, url: string, body: unknown, timeoutMs = 5000): Promise<number> {
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  await res.body?.cancel().catch(() => {});
  return res.status;
}
