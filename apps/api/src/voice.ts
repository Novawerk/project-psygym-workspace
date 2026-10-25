// Voice sessions through an ElevenLabs agent (docs/decisions/0013-voice-elevenlabs.md).
// ElevenLabs does the listening and the speaking; the words still come from us. Its agent's
// "custom LLM" is POST /voice/llm/chat/completions: OpenAI Chat Completions in, SSE out.
// Stateless like /chat: ElevenLabs sends the whole conversation each turn and nothing is stored.
import { z } from "zod";
import { LocaleSchema, MAX_MESSAGE_CHARS, MAX_MESSAGES, type Locale, type Message } from "./schema.js";

/** Where the app's case and language travel when the SDK can't send `extra_body`: the agent's
 * system prompt holds `{{psygym}}`, a dynamic variable the app sets to `case=<id> locale=<zh|en>`. */
const MARKER = /\bcase=([A-Za-z0-9_-]{1,100})\s+locale=(zh|en)\b/;

const ContentPart = z.object({ type: z.string(), text: z.string().optional() }).passthrough();
const OpenAiMessage = z
  .object({
    role: z.string(),
    content: z.union([z.string(), z.array(ContentPart), z.null()]).optional(),
  })
  .passthrough();
const OpenAiTool = z.object({ type: z.string().optional(), function: z.object({ name: z.string() }).passthrough().optional() }).passthrough();

export const VoiceLlmBody = z
  .object({
    messages: z.array(OpenAiMessage).max(1000),
    tools: z.array(OpenAiTool).optional(),
    elevenlabs_extra_body: z
      .object({ caseId: z.string().min(1).max(100), locale: LocaleSchema })
      .partial()
      .passthrough()
      .optional(),
  })
  .passthrough();
export type VoiceLlmBody = z.infer<typeof VoiceLlmBody>;

export interface VoiceTurn {
  caseId: string;
  locale: Locale;
  /** In our shape: counselor = what ElevenLabs heard the trainee say, client = what it spoke for us. */
  messages: Message[];
  /** The agent offers ElevenLabs' end_call system tool: our end_session becomes a call to it. */
  canEndCall: boolean;
}

const textOf = (content: z.infer<typeof OpenAiMessage>["content"]) =>
  typeof content === "string" ? content : (content ?? []).map((p) => p.text ?? "").join("");

/** Case, language and conversation from one ElevenLabs request; null when the case or language is missing. */
export function voiceTurn(body: VoiceLlmBody): VoiceTurn | null {
  const extra = body.elevenlabs_extra_body;
  const system = body.messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n");
  const marked = system.match(MARKER);
  const caseId = extra?.caseId ?? marked?.[1];
  const locale = extra?.locale ?? (marked?.[2] as Locale | undefined);
  if (!caseId || !locale) return null;

  const messages: Message[] = [];
  for (const m of body.messages) {
    const role = m.role === "user" ? "counselor" : m.role === "assistant" ? "client" : null;
    const text = textOf(m.content).trim().slice(0, MAX_MESSAGE_CHARS);
    if (!role || !text) continue; // ElevenLabs' system prompt and tool results never reach the model
    const last = messages.at(-1);
    // Two transcripts in a row from the same side (the trainee paused mid-thought): one message.
    if (last?.role === role) last.text = `${last.text} ${text}`.slice(0, MAX_MESSAGE_CHARS);
    else messages.push({ role, text });
  }
  const canEndCall = (body.tools ?? []).some((t) => t.function?.name === END_CALL);
  return { caseId, locale, messages: messages.slice(-MAX_MESSAGES), canEndCall };
}

/** ElevenLabs' system tool that hangs up. */
export const END_CALL = "end_call";

/** Added to the client's prompt in voice sessions: everything it writes is spoken aloud. */
export const VOICE_NOTE: Record<Locale, string> = {
  zh: "## 语音会谈\n\n这场会谈是语音的：你写的每个字都会被直接读出来。只写说出口的话，不写任何符号、标记或表情。",
  en: "## Voice session\n\nThis session is spoken: every word you write is read aloud. Write only what you say, no symbols, marks or emoji.",
};

/** Said to the trainee when the model fails mid-call; ElevenLabs speaks it like any reply. */
export const VOICE_ERROR_LINE: Record<Locale, string> = {
  zh: "不好意思，我刚才走神了，你能再说一遍吗？",
  en: "Sorry, I lost my train of thought. Could you say that again?",
};

/** OpenAI-style streaming chunks, the only shape ElevenLabs reads back. */
export function chunk(id: string, created: number, model: string, delta: Record<string, unknown>, finish: string | null = null) {
  return JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason: finish }] });
}

export function endCallDelta(locale: Locale) {
  return {
    tool_calls: [
      {
        index: 0,
        id: "call_end_session",
        type: "function",
        function: { name: END_CALL, arguments: JSON.stringify({ reason: locale === "zh" ? "来访者结束了这次会谈" : "The client ended the session" }) },
      },
    ],
  };
}

/** Mints a conversation token for the private agent (valid a few minutes, one conversation). */
export async function conversationToken(
  fetchFn: (url: string, init: RequestInit) => Promise<Response>,
  apiKey: string,
  agentId: string,
  timeoutMs = 5000,
): Promise<string> {
  const url = `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`;
  const res = await fetchFn(url, { method: "GET", headers: { "xi-api-key": apiKey }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`elevenlabs token: HTTP ${res.status}`);
  const token = ((await res.json()) as { token?: unknown }).token;
  if (typeof token !== "string" || !token) throw new Error("elevenlabs token: no token in the answer");
  return token;
}

/** POST /voice/session: which case, in which language. */
export const VoiceSessionBody = z.object({ caseId: z.string().min(1).max(100), locale: LocaleSchema });
