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

export const SupervisionBody = base.refine((b) => b.messages.some((m) => m.role === "counselor"), {
  message: "the transcript needs at least one counselor message",
  path: ["messages"],
});

export type ErrorCode = "invalid_request" | "invite_required" | "case_not_found" | "rate_limited" | "model_unavailable";

/** Frames on the wire (data-only SSE, one JSON object each). */
export type StreamEvent =
  | { type: "turn_start" }
  | { type: "text_delta"; text: string }
  | { type: "turn_end"; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "error"; code: string; message: string };
