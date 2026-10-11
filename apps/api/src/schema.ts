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

const base = z.object({
  caseId: z.string().min(1).max(100),
  locale: LocaleSchema,
  messages: z.array(MessageSchema).min(1).max(MAX_MESSAGES),
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
