// Request shapes from docs/api-contract.md.
import { z } from "zod";

export const MAX_MESSAGE_CHARS = 2000;
export const MAX_MESSAGES = 80;

export const LocaleSchema = z.enum(["zh", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const MessageSchema = z.object({
  role: z.enum(["counselor", "client"]),
  text: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});
export type Message = z.infer<typeof MessageSchema>;

/** A note on one earlier session, written by POST /session-summary and kept on the phone. */
export const MAX_SUMMARY_CHARS = 1200;
export const MAX_PREVIOUS = 5;
export const PreviousSession = z.object({
  number: z.number().int().min(1).max(5),
  summary: z.string().trim().min(1).max(MAX_SUMMARY_CHARS),
});
export type PreviousSession = z.infer<typeof PreviousSession>;

/**
 * Which session this is (docs/decisions/0014-follow-up-sessions.md). Missing: the first session,
 * exactly as before. `previous`: notes on the earlier ones, oldest first, each before `number`.
 */
export const SessionInfo = z
  .object({
    number: z.number().int().min(1).max(6),
    previous: z.array(PreviousSession).max(MAX_PREVIOUS).optional().default([]),
  })
  .refine((s) => s.previous.every((p) => p.number < s.number), { message: "previous sessions must come before this one", path: ["previous"] })
  .refine((s) => new Set(s.previous.map((p) => p.number)).size === s.previous.length, { message: "a previous session appears twice", path: ["previous"] });
export type SessionInfo = z.infer<typeof SessionInfo>;
export const FIRST_SESSION: SessionInfo = { number: 1, previous: [] };

const base = z.object({
  caseId: z.string().min(1).max(100),
  locale: LocaleSchema,
  messages: z.array(MessageSchema).min(1).max(MAX_MESSAGES),
  session: SessionInfo.optional(),
});

export const ChatBody = base.refine((b) => b.messages.at(-1)?.role === "counselor", {
  message: "the last message must be the counselor's",
  path: ["messages"],
});

export const MAX_DURATION_SEC = 7200;

// A session usually ends on the client's reply, so supervision takes either role last.
// A very short transcript still gets a report (the prompt says how to handle it).
// durationSec (optional) only feeds the anonymous counts; anything that isn't a whole number
// of seconds in 0–7200 is ignored, never a 400.
export const SupervisionBody = base.extend({
  // "final" (default): the full report. "live": short notes mid-session. Anything else is a 400.
  mode: z.enum(["final", "live"]).optional().default("final"),
  durationSec: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_DURATION_SEC ? v : undefined)),
});

export type ErrorCode =
  | "invalid_request"
  | "invite_required"
  | "case_not_found"
  | "rate_limited"
  | "model_unavailable"
  | "session_expired"
  | "update_required";

/** Frames on the wire (data-only SSE, one JSON object each). */
export type StreamEvent =
  | { type: "turn_start" }
  | { type: "text_delta"; text: string }
  | { type: "session_end" }
  | { type: "turn_end"; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "error"; code: string; message: string };

/** POST /session-summary: the transcript of a session that just ended, for the next one. */
export const SummaryBody = base;
