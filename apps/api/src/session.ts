// Turns a request body (case + locale + the whole conversation) into one model request.
// Stateless: nothing here is stored.
import type { Case, Prompts } from "./content.js";
import type { Message as LlmMessage, ModelRequest, ToolCall, ToolSpec } from "./llm/types.js";
import type { Locale, Message } from "./schema.js";

const LANGUAGE: Record<Locale, string> = {
  zh: "用简体中文说话。",
  en: "Speak English. The case brief is in Chinese; keep its facts, but say everything in natural English. Never write Chinese, and never write stage directions in brackets.",
};

const REPORT_LANGUAGE: Record<Locale, string> = {
  zh: "用简体中文写报告。引用原话用「」，保留原文。不要写 [7] 这样的消息编号。",
  en:
    "Write the whole report in English: headings, explanations and the line after “Try instead:”. " +
    "Only a word-for-word quote keeps its original words. Quote the counselor's or the client's words exactly as they were said, in “”. " +
    "Never use 「」 or 可以换成, and never write message numbers such as [7].",
};

const SPEAKER: Record<Locale, { counselor: string; client: string }> = {
  zh: { counselor: "咨询师", client: "来访者" },
  en: { counselor: "Counselor", client: "Client" },
};

/**
 * The AI client's only tool. It calls it after saying its closing line, when the rules in
 * prompts/client.md say the session is over. The server turns the call into a session_end frame.
 */
export const END_SESSION_TOOL: ToolSpec = {
  name: "end_session",
  description:
    "End this counseling session because the counselor's harmful remarks reached the threshold. Call it after " +
    "your closing line, and after every short line once the session has ended. Never call it for any other reason, " +
    "including the counselor wrapping up normally.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

export const endsSession = (calls: ToolCall[]) => calls.some((c) => c.name === END_SESSION_TOOL.name);

/** Said for the client when it ends the session without a closing line of its own. */
export const FAREWELL: Record<Locale, string> = {
  zh: "我想今天先到这里。",
  en: "I'd like to stop here for today.",
};

const ALIAS_LINE: Record<Locale, (name: string) => string> = {
  zh: (name) => `你叫「${name}」。需要自称或介绍自己时用这个名字。`,
  en: (name) => `Your name here is "${name}". Use it when you introduce yourself or are asked your name.`,
};

/** The AI client answers the counselor's last message, in character. */
export function clientRequest(prompts: Prompts, c: Case, locale: Locale, messages: Message[]): Omit<ModelRequest, "signal"> {
  // The pseudonym, when the case has one, is what the client calls itself in this language.
  const alias = c.clientAlias ? [`## 你的化名\n\n${ALIAS_LINE[locale](c.clientAlias[locale])}`] : [];
  const system = [prompts.client, "## 你扮演的来访者（病例）", c.brief, ...alias, "## 语言", LANGUAGE[locale]].join("\n\n");
  const out: LlmMessage[] = messages.map((m) =>
    m.role === "counselor"
      ? { role: "user", text: m.text }
      : { role: "assistant", text: m.text, toolCalls: [] },
  );
  // Some vendors want the conversation to open with a user turn.
  if (out[0]?.role === "assistant") out.unshift({ role: "user", text: locale === "zh" ? "（会谈开始）" : "(The session begins.)" });
  return { system, messages: out, tools: [END_SESSION_TOOL] };
}

/**
 * Placeholder for "can I take this client on / should I refer" (skill id intake_decision), until
 * 聆镜 writes the standard (docs/product/session-stages.md). Added to the report's prompt only
 * when the counselor has written at least this many messages.
 */
export const INTAKE_MIN_COUNSELOR_LINES = 15;

const INTAKE_RULE: Record<Locale, string> = {
  zh: [
    "## 承接判断（这场会谈够长，才有这一条）",
    "",
    "在「下次练什么」里，用**一句话**提醒练习判断能不能承接这位来访者，例如：初次会谈里，可以练习评估自己能不能承接这位来访者（例如了解来访者的期待，说明接下来怎么安排）。",
    "",
    "- 它排在「下次练什么」的最后。这一部分已经有 2 条更具体的练习时，不另开一条，把这句话并进第 2 条，作为最后半句。",
    "- 不引原话，不算进「需要改进的地方」，不判对错。",
    "- 风险筛查和伤害性的话的优先级不变。",
  ].join("\n"),
  en: [
    "## Intake decision (only because this session is long enough)",
    "",
    "In \"What to practise next\", add **one sentence** reminding the counselor to practise deciding whether they can take this client on, for example: In a first session, practise judging whether you can take this client on (for example, ask what the client hopes for and explain what happens next).",
    "",
    "- It comes last in that section. If the section already has 2 more specific items, don't add a third: put this sentence at the end of the second item.",
    "- No quote, not part of \"What to improve\", no judgement of right or wrong.",
    "- The risk-screening item and harmful remarks keep their priority.",
  ].join("\n"),
};

/** Low temperature for the report: steadier structure, fewer garbled words. The client keeps the default. */
export const SUPERVISOR_TEMPERATURE = 0.3;

/**
 * The AI supervisor reads the whole transcript and writes one report.
 * It gets no case text at all (no role brief, no title, no summary): the report must rest only
 * on what was said in the session. Even the picker's summary got quoted back as if the client
 * had said it.
 */
export function supervisorRequest(prompts: Prompts, c: Case, locale: Locale, messages: Message[]): Omit<ModelRequest, "signal"> {
  // Long enough sessions only: the server counts, not the model (models miscount).
  const intake = messages.filter((m) => m.role === "counselor").length >= INTAKE_MIN_COUNSELOR_LINES ? [INTAKE_RULE[locale]] : [];
  const system = [
    prompts.supervisor,
    "## 督导标准",
    prompts.rubrics[c.school],
    ...intake,
    "## 语言",
    REPORT_LANGUAGE[locale],
  ].join("\n\n");
  const names = SPEAKER[locale];
  const transcript = messages.map((m, i) => `[${i + 1}] ${names[m.role]}：${escapeTranscript(m.text)}`).join("\n\n");
  const intro = locale === "zh" ? "以下是本次练习的完整记录。请写督导报告。" : "Here is the full transcript of this practice session. Write the supervision report.";
  return {
    system,
    messages: [{ role: "user", text: `${intro}\n\n<transcript>\n${transcript}\n</transcript>` }],
    tools: [],
    temperature: SUPERVISOR_TEMPERATURE,
  };
}

/**
 * Mid-session notes (mode "live"): the same transcript, read so far, with prompts/supervisor-live.md.
 * No case text either. A few lines, no headings, no AI line (the app writes that).
 */
export function liveSupervisorRequest(prompts: Prompts, c: Case, locale: Locale, messages: Message[]): Omit<ModelRequest, "signal"> {
  const system = [prompts.supervisorLive, "## 督导标准", prompts.rubrics[c.school], "## 语言", LIVE_LANGUAGE[locale]].join("\n\n");
  const names = SPEAKER[locale];
  const transcript = messages.map((m, i) => `[${i + 1}] ${names[m.role]}：${escapeTranscript(m.text)}`).join("\n\n");
  const intro =
    locale === "zh"
      ? "以下是这场练习到目前为止的记录，会谈还在进行。请给几句中途提示。"
      : "Here is the practice session so far; it is still going on. Give a few mid-session notes.";
  return {
    system,
    messages: [{ role: "user", text: `${intro}\n\n<transcript>\n${transcript}\n</transcript>` }],
    tools: [],
    temperature: SUPERVISOR_TEMPERATURE,
  };
}

const LIVE_LANGUAGE: Record<Locale, string> = {
  zh: "用简体中文写。引用原话用「」，保留原文。不要写 [7] 这样的消息编号。",
  en:
    "Write every word in English: the notes, the explanations and the line after “Try instead:”. " +
    "Only a word-for-word quote keeps its original words. Quote the counselor's or the client's words exactly as they were said, in “”. " +
    "Never use 「」 or 可以换成, and never write message numbers such as [7].",
};

/** Message text can't open or close the <transcript> block: the tags are escaped. */
export function escapeTranscript(text: string): string {
  return text.replace(/<(\s*\/?\s*transcript\b[^>]*)>/gi, "&lt;$1&gt;");
}
