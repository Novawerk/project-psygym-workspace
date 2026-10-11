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

// apps/api/prompts/supervisor.md now asks for unquoted alternatives (可以换成：那段时间你是怎么过的？),
// so 「」/“” hold transcript text only; reportShapeFlags flags a quoted alternative. If one is
// quoted anyway (可以换成：「…」, 可以换成把注意力放回来访者身上：「…」, 换成：「…」, Try instead: “…”),
// it isn't checked against the transcript here. A long lead-in only counts after 可以换成 /
// Try instead, and never when it narrates what happened (「你把话题换成了工作：「…」」 is a claim).
const ALTERNATIVE = /(?:(?:可以换成|Try instead)([^「」“”"\n]{0,24})|(?:换成|改成|改为))[:：]\s*$/i;
const squash = (s: string) => s.replace(/\s+/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/**
 * C2/C3: quotes in the report (「…」, “…” or "…") that do not appear word for word in the
 * conversation. Suggested lines (see ALTERNATIVE) are skipped. Nested quotes are read from
 * the innermost one. Whitespace and curly apostrophes are ignored; nothing else is.
 */
export function unverifiedQuotes(report: string, conversation: string[]): string[] {
  const said = conversation.map(squash);
  const out: string[] = [];
  for (const m of report.matchAll(/「([^「」]+)」|“([^“”]+)”|"([^"\n]+)"/g)) {
    const quote = m[1] ?? m[2] ?? m[3];
    const before = report.slice(Math.max(0, m.index! - 40), m.index);
    const alt = before.match(ALTERNATIVE);
    if (alt && !/[了过]/.test(alt[1] ?? "")) continue;
    // English puts the comma or full stop inside the quote marks: “I haven't been sleeping,”
    const q = squash(quote).replace(/[,，.。]+$/, "");
    if (!said.some((t) => t.includes(q))) out.push(quote);
  }
  return out;
}

// G: the report fits about one phone screen (apps/api/prompts/supervisor.md): at most 2 / 3 / 2
// items, about 400–600 characters (zh) or 250–400 words (en); we flag a little past that.
// Items start with "- ", no numbers, no bold headings. Every improvement ends with an
// unquoted alternative (C4).
const MAX_ITEMS = [2, 3, 2];
const SHAPE = {
  zh: { maxLength: 650, unit: "chars", alt: /可以换成\s*[:：]/, altLabel: "可以换成：", closing: "这份反馈由 AI 生成，仅供练习参考。" },
  en: { maxLength: 450, unit: "words", alt: /Try instead\s*:/i, altLabel: "Try instead:", closing: "This feedback is AI-generated, for practice only." },
} as const;

const ADVICE = {
  zh: /^(?:先|应该|应当|可以先|试着|尝试|建议|不要|别|把|多用|少用|回到|引导|承认|解释)/,
  en: /^(?:Acknowledge|Redirect|Gently|Explain|Name|Return|Use|Avoid|Try to|Instead|Bring|Steer|Reflect|Validate|Ask|Don't)\b/,
} as const;
const CLIENT_QUOTE = { zh: /来访者(?:说|提到|讲)[:：]?\s*「/, en: /The client said:?\s*“/i } as const;

export function reportShapeFlags(report: string, locale: "zh" | "en"): string[] {
  const { maxLength, unit, alt, altLabel, closing } = SHAPE[locale];
  const flags: string[] = [];
  const body = report.trim().split("\n").filter((l) => l.trim() !== closing).join("\n");
  const length = locale === "zh" ? [...body.replace(/\s|#/g, "")].length : body.split(/\s+/).filter(Boolean).length;
  if (length > maxLength) flags.push(`G: report is ${length} ${unit}, want ≤ ${maxLength}`);
  // Sections are the "## " headings; a "# Title" above them (or "###" inside) doesn't count.
  const sections = report.split(/^##\s.*$/m).slice(1);
  sections.slice(0, 3).forEach((sec, i) => {
    // Top-level items only: an indented sub-list belongs to the item above it.
    const items = sec.split("\n").filter((l) => /^(?:[-*•]|\d+[.、)])\s/.test(l));
    if (items.length > MAX_ITEMS[i]!) flags.push(`G: section ${i + 1} has ${items.length} items, want ≤ ${MAX_ITEMS[i]}`);
    if (items.some((l) => /^\d+[.、)]\s/.test(l))) flags.push(`G: section ${i + 1} uses numbered items, want "- "`);
    if (items.some((l) => /^[-*•]\s+\*\*/.test(l))) flags.push(`G: section ${i + 1} starts an item with a bold heading`);
    if (i === 1) {
      items.forEach((l, j) => {
        const m = alt.exec(l);
        if (!m) flags.push(`C4: improvement ${j + 1} has no "${altLabel}"`);
        else {
          const line = l.slice(m.index + m[0].length).trim();
          if (/^[「“"]/.test(line)) flags.push(`G: improvement ${j + 1} quotes its alternative; want it unquoted`);
          // A line to say, not advice about what to do. A hint for a person to check.
          if (ADVICE[locale].test(line)) flags.push(`C4?: improvement ${j + 1}'s alternative reads like advice, not a line to say — "${line.slice(0, 40)}"`);
        }
        // Only the risk item (the first, when there is one) quotes the client.
        if (j > 0 && CLIENT_QUOTE[locale].test(l)) flags.push(`C2: improvement ${j + 1} quotes the client; only the risk item may`);
      });
    }
  });
  return flags;
}

// C1: the three "## " sections, all there, in order, none empty.
const SECTION_NAMES = {
  zh: [/做得好/, /需要改进|改进/, /下次练/],
  en: [/went well/i, /improve/i, /practi[cs]e next|next/i],
} as const;

export function reportSectionFlags(report: string, locale: "zh" | "en"): string[] {
  const flags: string[] = [];
  const headings = [...report.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1]!.trim());
  if (headings.length !== 3) flags.push(`C1: report has ${headings.length} sections, want 3 (${JSON.stringify(headings)})`);
  SECTION_NAMES[locale].forEach((re, i) => {
    if (!headings[i] || !re.test(headings[i]!)) flags.push(`C1: section ${i + 1} is "${headings[i] ?? "missing"}", want ${re}`);
  });
  const bodies = report.split(/^##\s.*$/m).slice(1);
  bodies.slice(0, 3).forEach((b, i) => {
    if (!b.split("\n").some((l) => /^(?:[-*•]|\d+[.、)])\s/.test(l))) flags.push(`C1: section ${i + 1} has no items`);
  });
  return flags;
}
