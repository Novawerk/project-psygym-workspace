// Voice sessions through an ElevenLabs agent (docs/decisions/0013-voice-elevenlabs.md).
// ElevenLabs does the listening and the speaking; the words still come from us. Its agent's
// "custom LLM" is POST /voice/llm/chat/completions: OpenAI Chat Completions in, SSE out.
// Stateless like /chat: ElevenLabs sends the whole conversation each turn and nothing is stored.
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
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
    let text = textOf(m.content).trim().slice(0, MAX_MESSAGE_CHARS);
    if (!role || !text) continue; // ElevenLabs' system prompt and tool results never reach the model
    if (role === "counselor" && SILENT.test(text)) text = SILENCE[locale];
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

/** When the trainee stays quiet past the agent's turn timeout, ElevenLabs sends "..." as their turn. */
const SILENT = /^[.。…·\s]+$/;
/** What the client sees instead: the counselor is quiet, waiting for them to go on. */
export const SILENCE: Record<Locale, string> = {
  zh: "（咨询师没有说话，在等你继续）",
  en: "(The counselor says nothing and waits for you to go on.)",
};

/** Added to the client's prompt in voice sessions: everything it writes is spoken aloud, and in a
 * spoken session the client carries the talk (docs/decisions/0012). */
export const VOICE_NOTE: Record<Locale, string> = {
  zh: [
    "## 语音会谈",
    "",
    "这场会谈是语音的：你写的每个字都会被直接读出来。只写说出口的话，不写任何符号、标记或表情。",
    "",
    "- 每次说一整段，一两百字到三四百字都很平常。说完一件事别停下来等咨询师提问：接着说这件事让你想到的别的事、当时和现在的感受。",
    "- 咨询师只说几个字、「嗯」一声，你就顺着往下说，说得更具体。",
    "- 看到「（咨询师没有说话，在等你继续）」，表示咨询师在安静地听。你就自己接着说：补充刚才的事，或者说起新想到的事。不要问咨询师「你怎么不说话」，也不要重复刚才说过的话。",
    "- 咨询师下了解释、问了封闭的问题，你也可以只回一两句。",
    "- **说话要像张嘴说出来的，不像写出来的。** 短句多，一句话常常说一半就换个说法；多用「就是」「然后」「那个」「怎么说」「反正」这类口头词；会重复、会自己打断自己（例：「我那天，不对，是前天，前天晚上……」）。不用书面词（「然而」「因此」「此外」「总而言之」），不排比，不总结，不在每段最后收个尾。",
  ].join("\n"),
  en: [
    "## Voice session",
    "",
    "This session is spoken: every word you write is read aloud. Write only what you say, no symbols, marks or emoji.",
    "",
    "- Say a full stretch each time; a long paragraph is normal. When you finish one thing, don't stop and wait for a question: go on to what it brings to mind and how you felt then and now.",
    "- When the counselor says only a few words or \"mm\", keep going and get more specific.",
    "- \"(The counselor says nothing and waits for you to go on.)\" means the counselor is listening quietly. Go on by yourself: add to what you said, or bring up something new. Don't ask why they are quiet, and don't repeat yourself.",
    "- After an interpretation or a closed question, one or two sentences is fine.",
    "- **Sound spoken, not written.** Short clauses, half-finished sentences you restart, fillers (\"like\", \"I mean\", \"you know\"), repeating yourself, correcting yourself (\"that day, no, the day before…\"). No written connectives (\"however\", \"therefore\", \"in conclusion\"), no neat lists, no summing up at the end of each turn.",
  ].join("\n"),
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
  const client = new ElevenLabsClient({ apiKey, fetch: fetchFn as typeof fetch, maxRetries: 0 });
  const { token } = await client.conversationalAi.conversations.getWebrtcToken(
    { agentId },
    { timeoutInSeconds: timeoutMs / 1000, maxRetries: 0 },
  );
  if (typeof token !== "string" || !token) throw new Error("elevenlabs token: no token in the answer");
  return token;
}

/** POST /voice/session: which case, in which language. */
export const VoiceSessionBody = z.object({ caseId: z.string().min(1).max(100), locale: LocaleSchema });
