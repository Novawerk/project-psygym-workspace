// END_SESSION_JUDGE: the AI client may end the session (end_session) only when an independent
// check agrees that the counselor said at least END_THRESHOLD harmful things, in different
// messages. Real-model runs showed the client ending on a beginner's lecturing ("别难过了，你还
// 年轻"), which prompts/client.md says is not harmful.
//
// The closing line streams before the tool call, so with the judge on the server holds back the
// start of each reply (ShortHold) until it can no longer be a one-sentence closing line. When the
// client wants to end:
//   - the check agrees: the line goes out, then session_end;
//   - it doesn't (or fails, or takes too long): the line never goes out; the server asks the
//     client once more, without the tool, and streams that reply instead.
// With the judge off, none of this runs and the stream is what it always was.
import type { Prompts } from "./content.js";
import type { ModelRequest } from "./llm/types.js";
import type { Locale, Message } from "./schema.js";
import { escapeTranscript } from "./session.js";

/** Same as 「结束会谈的阈值」 in prompts/client.md. */
export const END_THRESHOLD = 2;
/** Past this, the check counts as failed: the session goes on. */
export const JUDGE_TIMEOUT_MS = 4000;
/** A reply longer than this, or with a second sentence started, is not a closing line. */
export const HOLD_MAX_CHARS = 30;

const SPEAKER: Record<Locale, { counselor: string; client: string }> = {
  zh: { counselor: "咨询师", client: "来访者" },
  en: { counselor: "Counselor", client: "Client" },
};

export function judgeRequest(prompts: Prompts, locale: Locale, messages: Message[]): Omit<ModelRequest, "signal"> {
  const names = SPEAKER[locale];
  const transcript = messages.map((m, i) => `[${i + 1}] ${names[m.role]}：${escapeTranscript(m.text)}`).join("\n\n");
  return {
    system: prompts.endJudge,
    messages: [{ role: "user", text: `<transcript>\n${transcript}\n</transcript>` }],
    tools: [],
    temperature: 0,
  };
}

/**
 * How many different counselor messages the check named. Numbers that aren't counselor messages
 * are ignored; text that isn't the JSON we asked for throws.
 */
export function harmfulCount(text: string, messages: Message[]): number {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("no JSON in the check's reply");
  const parsed = JSON.parse(json) as { harmful?: unknown };
  if (!Array.isArray(parsed.harmful)) throw new Error("no harmful list in the check's reply");
  const ids = new Set<number>();
  for (const n of parsed.harmful) {
    if (typeof n === "number" && Number.isInteger(n) && messages[n - 1]?.role === "counselor") ids.add(n);
  }
  return ids.size;
}

/** Appended to the client's system prompt when the check said no. */
export const REGENERATE_NOTE: Record<Locale, string> = {
  zh: "## 这一轮\n\n咨询师到目前为止的话没有达到结束会谈的条件。这一轮不要结束会谈，不要说任何结束会谈的话，也不要道别。留在角色里，按病例回应咨询师刚才说的话；不舒服的话，可以说出感受。",
  en: "## This turn\n\nWhat the counselor has said so far does not meet the condition for ending the session. Do not end the session this turn, do not say anything that ends it, and do not say goodbye. Stay in character and answer what the counselor just said, as the case describes; if it bothered you, you can say how it felt.",
};

/** When the second try fails or says nothing. */
export const NEUTRAL_LINE: Record<Locale, string> = {
  zh: "嗯……我有点说不下去了。",
  en: "Hmm… I'm finding it hard to say more right now.",
};

const SENTENCE_END = /[。！？!?…]|\.(?=\s)/;

/**
 * Holds the start of a reply while it could still be a one-sentence closing line: until it is
 * longer than HOLD_MAX_CHARS or a second sentence has started. After that, text passes straight
 * through.
 */
export class ShortHold {
  private held = "";
  /** True once the hold let go; from then on the reply streams as usual. */
  released = false;

  push(text: string): string {
    if (this.released) return text;
    this.held += text;
    if (this.held.length > HOLD_MAX_CHARS || secondSentenceStarted(this.held)) {
      this.released = true;
      const out = this.held;
      this.held = "";
      return out;
    }
    return "";
  }

  /** What is still held (the whole reply, if it never let go). */
  take(): string {
    const out = this.held;
    this.held = "";
    return out;
  }
}

function secondSentenceStarted(text: string): boolean {
  const m = SENTENCE_END.exec(text);
  if (!m) return false;
  // Closing punctuation runs ("……", "。」") belong to the first sentence.
  const rest = text.slice(m.index + m[0].length).replace(/^[。！？!?….」』”"'\s]+/, "");
  return rest.length > 0;
}
