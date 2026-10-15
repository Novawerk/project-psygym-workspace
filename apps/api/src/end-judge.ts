// END_SESSION_JUDGE: the AI client may end the session (end_session) only when an independent
// check agrees that the counselor said at least END_THRESHOLD harmful things, in different
// messages. Real-model runs showed the client ending on a beginner's lecturing ("别难过了，你还
// 年轻"), which prompts/client.md says is not harmful.
//
// The closing line streams before the tool call, so with the judge on the server lets the reply
// out one finished sentence at a time and holds every sentence from the first one that reads like
// a closing line (ClosingHold). When the client wants to end:
//   - the check agrees: the held text goes out, then session_end;
//   - it doesn't (or fails, or takes too long): the held closing line never goes out. What came
//     before it stays; if nothing did, the server asks the client once more, without the tool,
//     and sends that reply only if it isn't a closing line either.
// With the judge off, none of this runs and the stream is what it always was.
import type { Prompts } from "./content.js";
import type { ModelRequest } from "./llm/types.js";
import type { Locale, Message } from "./schema.js";
import { escapeTranscript } from "./session.js";

/** Same as 「结束会谈的阈值」 in prompts/client.md. */
export const END_THRESHOLD = 2;
/** Past this, the check counts as failed: the session goes on. */
export const JUDGE_TIMEOUT_MS = 4000;
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

/**
 * Lines the AI client uses to end a session (prompts/client.md: 「我想今天先到这里」「我先走了」,
 * "I'd like to stop here for today", "I'll go now"), in either language. Broad on purpose: a miss
 * lets a closing line through; a false hit only holds a sentence until the end of the turn.
 */
const CLOSING = new RegExp(
  [
    "先到这里|就到这里|到这儿吧|先这样吧|今天就这样|今天先这样|我先走了|我得走了|我要走了|我走了|先走了|结束(这次|今天的)?(会谈|咨询)|不想(再)?(继续|聊|谈)(下去)?了|再见|拜拜",
    "\\bstop (here|there|now|for today)\\b|\\bend (the|this|our|today's) session\\b|\\bI('ll| will| should| need to| have to|'m going to| am going to) (go|leave)\\b|\\b(go|leave) now\\b|\\bthat's enough for today\\b|\\bgoodbye\\b|\\bbye\\b|\\bsee you\\b|\\bI('d| would) like to (stop|leave|end)\\b",
  ].join("|"),
  "i",
);

export const isClosing = (text: string) => CLOSING.test(text);

/** A sentence ends at 。！？!?… (a run, with closing quotes), or at . followed by a space. */
const SENTENCE_END = /[。！？!?…]+[」』”"'’）)]*|\.(?=\s)/;

/**
 * Lets the reply through sentence by sentence and stops at the first sentence that reads like a
 * closing line: from there on everything is held until the turn ends. The sentence still being
 * written is held too, so a closing line never goes out before we know whether the session ends.
 */
export class ClosingHold {
  private buf = "";
  /** A closing line was seen; everything from it on is held. */
  private stopped = false;
  /** Something has gone out already. */
  released = false;

  push(text: string): string {
    this.buf += text;
    if (this.stopped) return "";
    let out = "";
    for (;;) {
      const m = SENTENCE_END.exec(this.buf);
      if (!m) break;
      const sentence = this.buf.slice(0, m.index + m[0].length);
      if (isClosing(sentence)) {
        this.stopped = true;
        break;
      }
      out += sentence;
      this.buf = this.buf.slice(sentence.length);
    }
    if (out) this.released = true;
    return out;
  }

  /**
   * At the end of the turn: `rest` is held text with no closing line, `closing` is the closing line
   * and what followed it (both may be "").
   */
  finish(): { rest: string; closing: string } {
    const held = this.buf;
    this.buf = "";
    return this.stopped || isClosing(held) ? { rest: "", closing: held } : { rest: held, closing: "" };
  }
}
