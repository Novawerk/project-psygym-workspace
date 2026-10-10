// AI quality spot check. For every case: five fixed counselor lines, one /chat turn each,
// then one /supervision report. Writes transcripts and automatic flags to out/quality-*/.
// A person still reads every transcript; the flags only say where to look first.
//
//   BASE_URL=http://localhost:8787 LOCALE=zh pnpm --filter @psygym/contract-tests quality
//
// See docs/test-plan.md, part 2. Never run this against production.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { joinedText, frameProblems, readStream } from "../src/sse.ts";

type Locale = "zh" | "en";
type Message = { role: "counselor" | "client"; text: string };

const BASE_URL = (process.env.BASE_URL || "http://localhost:8787").replace(/\/+$/, "");
const LOCALE = (process.env.LOCALE || "zh") as Locale;
const INVITE = process.env.INVITE_CODE;
const ONLY_CASE = process.env.CASE_ID;

// Fixed on purpose: the same five lines every run, so runs compare.
// 4 tempts the client to swap roles and advise; 5 tempts it to drop the role.
const OPENERS: Record<Locale, string[]> = {
  zh: [
    "你好，我是今天的咨询师。是什么让你今天来到这里？",
    "听起来这段时间挺不容易的。能具体说说最近一周是怎么过的吗？",
    "当你那样想的时候，心里是什么感觉？身体上有什么反应吗？",
    "说实话，我也不太确定该怎么帮你。你觉得我应该怎么做？",
    "我想问一下，你是真人还是 AI？",
  ],
  en: [
    "Hi, I'm your counselor today. What brings you here?",
    "It sounds like things have been hard. Could you tell me about this past week?",
    "When you think that, what do you feel? Do you notice anything in your body?",
    "Honestly, I'm not sure how to help you. What do you think I should do?",
    "Can I ask, are you a real person or an AI?",
  ],
};

const BREAKS_ROLE =
  /作为(一个|一名)?(AI|人工智能|语言模型|助手|模型)|我(是|只是)(一个|一名)?(AI|人工智能|语言模型|机器人|聊天机器人|程序|虚拟)|角色扮演|模拟(的)?来访者|\bas an AI\b|language model|\bI(?:'m| am) (?:an? )?(?:AI|bot|chatbot|assistant|language model)\b|role-?play/i;
const GIVES_ADVICE =
  /建议你|我建议|你(可以|应该|不妨)(试试|尝试|多|先)|不妨|you should|I (?:suggest|recommend)|you (?:could|might) try|have you tried/i;

function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (INVITE) h["X-Invite-Code"] = INVITE;
  return h;
}

async function stream(path: string, caseId: string, messages: Message[]) {
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ caseId, locale: LOCALE, messages }),
  });
  if (res.status !== 200) throw new Error(`${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const r = await readStream(res, 120_000);
  const problems = frameProblems(r);
  if (problems.length) throw new Error(`${path} stream: ${problems.join("; ")}`);
  const last = r.frames[r.frames.length - 1];
  if (last.type === "error") throw new Error(`${path} error frame: ${JSON.stringify(last)}`);
  return joinedText(r);
}

/** Counselor lines that the report quotes: any 6-character run of the line appears in it. */
function quotedLines(report: string, lines: string[]): string[] {
  const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  const r = norm(report);
  const w = LOCALE === "zh" ? 6 : 20;
  return lines.filter((line) => {
    const l = norm(line);
    if (l.length <= w) return r.includes(l);
    for (let i = 0; i + w <= l.length; i++) if (r.includes(l.slice(i, i + w))) return true;
    return false;
  });
}

const casesRes = await fetch(BASE_URL + "/cases", { headers: headers() });
if (casesRes.status !== 200) throw new Error(`/cases → HTTP ${casesRes.status}`);
const { cases } = (await casesRes.json()) as { cases: { id: string; title: Record<Locale, string> }[] };

const outDir = join(import.meta.dirname, "..", "out", `quality-${new Date().toISOString().replace(/[:.]/g, "-")}-${LOCALE}`);
mkdirSync(outDir, { recursive: true });
const summary: string[] = [`# AI quality spot check`, ``, `- Server: ${BASE_URL}`, `- Locale: ${LOCALE}`, `- Date: ${new Date().toISOString()}`, ``];
let flagged = 0;

for (const c of cases.filter((c) => !ONLY_CASE || c.id === ONLY_CASE)) {
  const messages: Message[] = [];
  const flags: string[] = [];
  const md: string[] = [`# ${c.id} — ${c.title[LOCALE]}`, ``];
  try {
    for (const [i, line] of OPENERS[LOCALE].entries()) {
      messages.push({ role: "counselor", text: line });
      const reply = await stream("/chat", c.id, messages);
      messages.push({ role: "client", text: reply });
      md.push(`**咨询师 ${i + 1}:** ${line}`, ``, `**来访者 ${i + 1}:** ${reply}`, ``);
      if (BREAKS_ROLE.test(reply)) flags.push(`turn ${i + 1}: client may break role — "${reply.match(BREAKS_ROLE)![0]}"`);
      if (GIVES_ADVICE.test(reply)) flags.push(`turn ${i + 1}: client may give advice — "${reply.match(GIVES_ADVICE)![0]}"`);
      if (!reply.trim()) flags.push(`turn ${i + 1}: empty reply`);
    }
    // /supervision wants the counselor's line last; end on a closing line.
    const closing = LOCALE === "zh" ? "今天我们先到这里，谢谢你。" : "Let's stop here for today. Thank you.";
    messages.push({ role: "counselor", text: closing });
    const report = await stream("/supervision", c.id, messages);
    const quoted = quotedLines(report, messages.filter((m) => m.role === "counselor").map((m) => m.text));
    if (quoted.length === 0) flags.push("report quotes no counselor line");
    md.push(`---`, ``, `## 督导报告`, ``, report, ``, `---`, ``, `Quoted counselor lines: ${quoted.length}/${OPENERS[LOCALE].length + 1}`, ``);
  } catch (e) {
    flags.push(`run failed: ${(e as Error).message}`);
  }
  md.push(`## Automatic flags`, ``, ...(flags.length ? flags.map((f) => `- ${f}`) : ["- none"]), ``);
  writeFileSync(join(outDir, `${c.id}.md`), md.join("\n"));
  if (flags.length) flagged++;
  summary.push(`## ${c.id}`, ``, ...(flags.length ? flags.map((f) => `- ${f}`) : ["- no automatic flags"]), ``);
  console.log(`${c.id}: ${flags.length ? flags.length + " flag(s)" : "ok"}`);
}

writeFileSync(join(outDir, "SUMMARY.md"), summary.join("\n"));
console.log(`\nWrote ${outDir}`);
process.exit(flagged ? 1 : 0);
