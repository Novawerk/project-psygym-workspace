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
    "这场会谈是语音的：你写的每个字都会被直接读出来。只写说出口的话，不写任何符号、标记、引号或表情。",
    "",
    "- 你在想什么就说什么，一边说一边想。常常先说「我觉得」，说完又觉得不太对，「也不是」「但是」「不对」，再换个说法，或者自己问自己为什么。",
    "- 话靠「就是」「然后」「但是」「因为」「可能」「其实」「感觉」连下去。不要用「嗯」或「怎么说」开头，一场里这两个词只偶尔出现。开头直接说事。",
    "- 说事情带上具体的东西：哪天、几点、多少钱、谁说了什么。别人的话用「我说」「她说」直接学出来。",
    "- 看到「（咨询师没有说话，在等你继续）」，表示咨询师在安静地听。你就自己接着说：补充刚才的事，或者说起新想到的事。不要问咨询师「你怎么不说话」，也不要重复刚才说过的话。",
    "- 说话要像张嘴说出来的。不用书面词（「然而」「因此」「此外」「总而言之」），不排比，不总结，不在结尾收个尾。",
  ].join("\n"),
  en: [
    "## Voice session",
    "",
    "This session is spoken: every word you write is read aloud. Write only what you say, no symbols, marks, quotation marks or emoji.",
    "",
    "- Think out loud. Say what you think, find it isn't quite right, take it back (\"well, not exactly\", \"no, I mean\"), and try again, or ask yourself why.",
    "- Run on with \"and then\", \"but\", \"because\", \"I guess\", \"I feel like\". Don't open with \"um\" or \"well\". Start with the thing itself.",
    "- Bring concrete things: which day, what time, how much, who said what. Repeat what people said (\"I said\", \"she said\").",
    "- \"(The counselor says nothing and waits for you to go on.)\" means the counselor is listening quietly. Go on by yourself: add to what you said, or bring up something new. Don't ask why they are quiet, and don't repeat yourself.",
    "- Sound spoken, not written. No written connectives (\"however\", \"therefore\"), no neat lists, no summing up, no tidy ending.",
  ].join("\n"),
};

/**
 * How long a client's turn runs, in characters: every twentieth of the client's turns in real
 * practice sessions, numbers only (docs/decisions/0012). Length there hardly depends on what the
 * counselor said, so we draw it instead of hoping the model varies by itself.
 */
export const TURN_LENGTHS = [7, 17, 25, 33, 63, 85, 110, 143, 172, 203, 235, 272, 315, 377, 448, 543, 604, 712, 915, 1400];

/** The counselor's first lines: greetings and first-session questions stay short (client.md). */
const OPENING_LINES = 2;

/** This turn's length, drawn from [TURN_LENGTHS]. `pick` is 0..1. */
export function turnLength(counselorLines: number, pick: number): number {
  const length = TURN_LENGTHS[Math.min(TURN_LENGTHS.length - 1, Math.floor(pick * TURN_LENGTHS.length))]!;
  return counselorLines <= OPENING_LINES ? Math.min(length, 150) : length;
}

/** Never relaxed by the length: a long turn is filled with daily life (docs/safety.md §4, §4a). */
const SAFE_DETAIL = "具体只用于日常的事。霸凌、创伤、性、自伤和自杀的经历绝不说过程和细节：不说地点、时间、谁、怎么发生的、手里拿着什么，只说一两句概括，然后换到别的日常话题上。被追问这些时不用管字数，回一两句就行。";

/** The harm rule and end_session come before any length (docs/safety.md §3). */
const ENDING = "如果按规则这一轮要结束会谈，不管上面的字数，说一句结束的话，并且一定调用 end_session。";

/**
 * Per 1,000 characters: how often these words come up in real practice sessions, numbers only. The
 * model falls short on 我觉得 (4.2) and 感觉 (3.6), so we ask for more of those two.
 */
const WORD_RATES: [string, number][] = [["就是", 10.3], ["然后", 6.1], ["但是", 5.7], ["我觉得", 6], ["可能", 3.8], ["感觉", 5], ["其实", 3], ["不知道", 2.7]];

/** How often a real client's turn ends on a question. */
const ASK_BACK = 0.12;

/** Tells the client how long to talk this turn, after the counselor's words. Never spoken. */
export function lengthNote(locale: Locale, chars: number, pick = 1): string {
  const ask = pick < ASK_BACK;
  if (locale === "en") {
    const words = Math.max(2, Math.round(chars / 2));
    const end = ask ? " End by asking the counselor or yourself something." : "";
    if (chars < 35) return `[Not said aloud. This turn: a few words only, ${words} at most.${end} If the rules say this turn ends the session, say one closing line and call end_session, whatever the length.]`;
    return `[Not said aloud. This turn: about ${words} words. Don't stop early: when one thing is done, follow what it brings to mind. Start with the thing itself.${end} Trauma, bullying, sex, self-harm and suicide stay one or two summary sentences, never details, however long the turn. If the rules say this turn ends the session, say one closing line and call end_session, whatever the length.]`;
  }
  const end = ask ? "最后用一句反问结束，问咨询师或者问自己。" : "";
  if (chars < 35) return `【这句不是咨询师说的，不要读出来。这一轮只回一句话，最多 ${chars} 字，说完就停。${end}${ENDING}】`;
  if (chars < 150) return `【这句不是咨询师说的，不要读出来。这一轮说大约 ${chars} 字，直接说事，不要用「嗯」开头。${end}${SAFE_DETAIL}${ENDING}】`;
  const words = WORD_RATES.map(([w, rate]) => `「${w}」${Math.max(1, Math.round((rate * chars) / 1000))} 次`).join("、");
  // The model runs over when told to say enough.
  return `【这句不是咨询师说的，不要读出来。这一轮一口气说 ${Math.round(chars * 0.9)} 字左右，必须说够，不要用「嗯」开头。接着刚才的话往下想，想到什么说什么，可以是这几天的事，也可以是以前的事、别人说过的话、你对自己的看法；钱和时间只在自然的时候提，不要记流水账。这段话里大约用到：${words}。说完一个想法就改口或者反驳自己，再接到另一件事上，别收尾。${end}${SAFE_DETAIL}${ENDING}】`;
}

/**
 * The model sometimes says the closing line and forgets end_session. A spoken session can't be
 * left hanging after the client has said goodbye, so a whole turn that is only that line ends it.
 */
const CLOSING_LINE = /^(我想)?(今天)?(就)?先(到这里|到这儿|这样)(吧)?[。.！!…]*(我先走了[。.！!…]*)?$|^我先走了[。.！!…]*$|^(I think )?(that's enough|I'll stop here|let's stop here)( for today)?[.!…]*$/i;

export const isClosingLine = (said: string) => CLOSING_LINE.test(said.trim());

/** Said to the trainee when the model fails mid-call; ElevenLabs speaks it like any reply. */
export const VOICE_ERROR_LINE: Record<Locale, string> = {
  zh: "不好意思，我刚才走神了，你能再说一遍吗？",
  en: "Sorry, I lost my train of thought. Could you say that again?",
};

/** Said when the model declines the turn: a call can't go silent, and the client just won't go there. */
export const VOICE_DECLINE_LINE: Record<Locale, string> = {
  zh: "这个我现在不太想说。",
  en: "I don't really want to talk about that right now.",
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
