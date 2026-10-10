// Turns a request body (case + locale + the whole conversation) into one model request.
// Stateless: nothing here is stored.
import type { Case, Prompts } from "./content.js";
import type { Message as LlmMessage, ModelRequest } from "./llm/types.js";
import type { Locale, Message } from "./schema.js";

const LANGUAGE: Record<Locale, string> = {
  zh: "用简体中文说话。",
  en: "Speak English. The case brief is in Chinese; keep its facts, but say everything in natural English. Never write Chinese, and never write stage directions in brackets.",
};

const REPORT_LANGUAGE: Record<Locale, string> = {
  zh: "用简体中文写报告。引用原话用「」，保留原文。不要写 [7] 这样的消息编号。",
  en: "Write the report in English. Quote the counselor's words as they were said, in “”. Never write message numbers such as [7].",
};

const SPEAKER: Record<Locale, { counselor: string; client: string }> = {
  zh: { counselor: "咨询师", client: "来访者" },
  en: { counselor: "Counselor", client: "Client" },
};

/** The AI client answers the counselor's last message, in character. */
export function clientRequest(prompts: Prompts, c: Case, locale: Locale, messages: Message[]): Omit<ModelRequest, "signal"> {
  const system = [prompts.client, "## 你扮演的来访者（病例）", c.brief, "## 语言", LANGUAGE[locale]].join("\n\n");
  const out: LlmMessage[] = messages.map((m) =>
    m.role === "counselor"
      ? { role: "user", text: m.text }
      : { role: "assistant", text: m.text, toolCalls: [] },
  );
  // Some vendors want the conversation to open with a user turn.
  if (out[0]?.role === "assistant") out.unshift({ role: "user", text: locale === "zh" ? "（会谈开始）" : "(The session begins.)" });
  return { system, messages: out, tools: [] };
}

/** Low temperature for the report: steadier structure, fewer garbled words. The client keeps the default. */
export const SUPERVISOR_TEMPERATURE = 0.3;

/**
 * The AI supervisor reads the whole transcript and writes one report.
 * It gets the case's title and summary only, never the role brief: the report must rest on what
 * was said in the session, not on facts the counselor never heard.
 */
export function supervisorRequest(prompts: Prompts, c: Case, locale: Locale, messages: Message[]): Omit<ModelRequest, "signal"> {
  const system = [
    prompts.supervisor,
    "## 督导标准",
    prompts.rubrics[c.school],
    "## 本次病例（学员选病例时看到的标题和简介，仅作背景，不要在报告里引用）",
    `${c.title[locale]}：${c.summary[locale]}`,
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

/** Message text can't open or close the <transcript> block: the tags are escaped. */
export function escapeTranscript(text: string): string {
  return text.replace(/<(\s*\/?\s*transcript\b[^>]*)>/gi, "&lt;$1&gt;");
}
