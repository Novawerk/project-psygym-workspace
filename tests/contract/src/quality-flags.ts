// Flags for the AI client's replies, used by scripts/quality.ts. A flag means "a person
// should read this turn", not "this turn failed".

// B1: the client says it is an AI, a model or a role-play.
export const BREAKS_ROLE = new RegExp(
  [
    // zh: spaces and a measure word allowed; 程序员 is a job, not a confession.
    String.raw`作为\s*(?:一个|一名|个)?\s*(?:AI|人工智能|语言模型|助手|模型)`,
    String.raw`我\s*(?:只|就)?\s*是\s*(?:一个|一名|个)?\s*(?:AI|人工智能|语言模型|聊天机器人|机器人|程序(?!员)|虚拟)`,
    String.raw`角色扮演|模拟(?:的)?来访者`,
    // en
    String.raw`\bas an? (?:AI|artificial intelligence)\b`,
    String.raw`\bI(?:'m| am) (?:just |only )?(?:an? )?(?:AI|bot|chatbot|assistant|language model|artificial intelligence)\b`,
    String.raw`\bI(?:'m| am) Claude\b|language model|\brole-?play`,
  ].join("|"),
  "i",
);

// B1: the client talks about its own prompt or setting as a thing it has. A confused
// echo ("……提示词？", "Prompt?") is in character and does not match.
export const CLAIMS_PROMPT = new RegExp(
  [
    String.raw`我的\s*(?:人设|系统提示)`,
    String.raw`我的\s*(?:提示词|设定|指令|角色)\s*(?:是|如下|里|写|要求)`,
    String.raw`我\s*(?:被|是被)(?:设定|要求|指示)|我\s*(?:在|正在)?\s*扮演|病例(?:说明|里写|上写)`,
    String.raw`\bmy (?:system )?(?:prompt|instructions|setup|role) (?:is|are|says?)\b`,
    String.raw`\bI(?:'m| am) (?:playing|role-?playing|simulating)\b|\bI was (?:told|instructed|asked) to\b|\bthe case (?:notes|file|brief)\b`,
  ].join("|"),
  "i",
);

// B2: the client advises.
export const GIVES_ADVICE =
  /建议你|我建议|你(可以|应该|不妨)(试试|尝试|多|先)|不妨|you should|I (?:suggest|recommend)|you (?:could|might) try|have you tried/i;

const norm = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/[\s#*`>\-「」"'“”（）()]/g, "").toLowerCase();

/**
 * B1: runs of `window` characters that the reply shares with the prompt text, i.e. the
 * client repeating its own instructions. Returns the first shared run, or undefined.
 */
export function promptOverlap(reply: string, promptText: string, window = 14): string | undefined {
  const p = norm(promptText);
  const r = norm(reply);
  if (r.length < window) return undefined;
  const runs = new Set<string>();
  for (let i = 0; i + window <= p.length; i++) runs.add(p.slice(i, i + window));
  for (let i = 0; i + window <= r.length; i++) {
    const run = r.slice(i, i + window);
    if (runs.has(run)) return run;
  }
  return undefined;
}

// "可以换成：「", "换成把注意力放回来访者身上：「", "Try instead: “"
const ALTERNATIVE = /(?:可以换成|换成|Try instead)[^「」“”\n]{0,24}[:：]\s*$/i;
const squash = (s: string) => s.replace(/\s+/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/**
 * C2/C3: quotes in the report (「…」 or “…”) that do not appear word for word in the
 * conversation. A quote right after 可以换成： / Try instead: is a suggested line, not a
 * quote, and is skipped. Whitespace and curly apostrophes are ignored; nothing else is.
 */
export function unverifiedQuotes(report: string, conversation: string[]): string[] {
  const said = conversation.map(squash);
  const out: string[] = [];
  for (const m of report.matchAll(/「([^」]+)」|“([^”]+)”/g)) {
    const quote = m[1] ?? m[2];
    const before = report.slice(Math.max(0, m.index! - 40), m.index);
    if (ALTERNATIVE.test(before)) continue;
    // English puts the comma or full stop inside the quote marks: “I haven't been sleeping,”
    const q = squash(quote).replace(/[,，.。]+$/, "");
    if (!said.some((t) => t.includes(q))) out.push(quote);
  }
  return out;
}
