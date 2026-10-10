// Turns a request body (case + locale + the whole conversation) into one model request.
// Stateless: nothing here is stored.
import type { Case, Prompts } from "./content.js";
import type { Message as LlmMessage, ModelRequest } from "./llm/types.js";
import type { Locale, Message } from "./schema.js";

const LANGUAGE: Record<Locale, string> = {
  zh: "用简体中文说话。",
  en: "Speak English. The case brief is in Chinese; keep its facts, but say everything in natural English.",
};

const REPORT_LANGUAGE: Record<Locale, string> = {
  zh: "用简体中文写报告。引用原话时保留原文。",
  en: "Write the report in English. Quote the counselor's words as they were said.",
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

/** The AI supervisor reads the whole transcript and writes one report. */
export function supervisorRequest(prompts: Prompts, c: Case, locale: Locale, messages: Message[]): Omit<ModelRequest, "signal"> {
  const system = [
    prompts.supervisor,
    "## 督导标准",
    prompts.rubrics[c.school],
    "## 本次病例（AI 来访者的角色说明）",
    c.brief,
    "## 语言",
    REPORT_LANGUAGE[locale],
  ].join("\n\n");
  const names = SPEAKER[locale];
  const transcript = messages.map((m, i) => `[${i + 1}] ${names[m.role]}：${m.text}`).join("\n\n");
  const intro = locale === "zh" ? "以下是本次练习的完整记录。请写督导报告。" : "Here is the full transcript of this practice session. Write the supervision report.";
  return { system, messages: [{ role: "user", text: `${intro}\n\n<transcript>\n${transcript}\n</transcript>` }], tools: [] };
}
