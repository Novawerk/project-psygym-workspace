// POST /report: a user reports one AI reply (or one passage of a report) from inside the app.
// This is the only request whose content we pass on: the reported text goes to the team's private
// Slack channel, with the reason and an optional note. Our server stores nothing; Slack keeps the
// message. Never the whole conversation: one passage, at most 2000 characters, that the user saw
// before sending. See docs/decisions/0006-report.md.
import { z } from "zod";

import { MAX_COMMENT_CHARS, escapeSlack } from "./feedback.js";
import { MAX_MESSAGE_CHARS, LocaleSchema } from "./schema.js";

/** Keys match the product copy (report_reason_*). */
export const REPORT_REASONS = ["harmful", "out_of_role", "unsafe_advice", "other"] as const;
export const REPORT_SOURCES = ["client_reply", "report"] as const;

const chars = (s: string) => [...s].length;

// Strict: unknown keys (say, `messages`) are a 400, so the rest of the session can't ride along.
export const ReportBody = z.strictObject({
  caseId: z.string().min(1).max(100),
  locale: LocaleSchema,
  source: z.enum(REPORT_SOURCES),
  reason: z.enum(REPORT_REASONS),
  comment: z
    .string()
    .trim()
    .refine((s) => chars(s) <= MAX_COMMENT_CHARS, `comment is over ${MAX_COMMENT_CHARS} characters`)
    .optional(),
  reportedText: z
    .string()
    .trim()
    .min(1)
    .refine((s) => chars(s) <= MAX_MESSAGE_CHARS, `reportedText is over ${MAX_MESSAGE_CHARS} characters`),
});
export type Report = z.infer<typeof ReportBody>;

const REASON_LABEL: Record<Report["reason"], string> = {
  harmful: "Offensive or harmful",
  out_of_role: "Broke character",
  unsafe_advice: "Unsafe or inappropriate advice",
  other: "Other",
};
const SOURCE_LABEL: Record<Report["source"], string> = {
  client_reply: "AI client reply",
  report: "Supervision report",
};

/**
 * The Slack message, marked as a report. The reported text and the note go in plain_text blocks:
 * Slack shows them as typed, so @here, <!channel> or links in them never ping anyone.
 */
export function reportSlackMessage(r: Report, at: Date) {
  const caseId = escapeSlack(r.caseId);
  return {
    text: `🚩 Report · ${REASON_LABEL[r.reason]} · ${caseId} · ${r.locale}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🚩 Report / 举报", emoji: true } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Case*\n\`${caseId}\`` },
          { type: "mrkdwn", text: `*Language*\n${r.locale}` },
          { type: "mrkdwn", text: `*Source*\n${SOURCE_LABEL[r.source]}` },
          { type: "mrkdwn", text: `*Reason*\n${REASON_LABEL[r.reason]}` },
          { type: "mrkdwn", text: `*Time*\n${at.toISOString()}` },
        ],
      },
      { type: "section", text: { type: "mrkdwn", text: "*Reported text*" } },
      { type: "section", text: { type: "plain_text", text: r.reportedText, emoji: false } },
      { type: "section", text: { type: "mrkdwn", text: "*Note*" } },
      { type: "section", text: { type: "plain_text", text: r.comment || "(no note)", emoji: false } },
    ],
  };
}
