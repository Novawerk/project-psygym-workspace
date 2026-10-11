// /supervision with mode "live": mid-session notes.
import { describe, expect, it } from "vitest";

import { createApp, type Logger } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import { MockProvider } from "../src/llm/mock.js";
import type { ModelProvider } from "../src/llm/types.js";
import { createCounter, type CountEvent, type MetricsStore } from "../src/metrics/counter.js";
import { SUPERVISOR_TEMPERATURE } from "../src/session.js";

const cases = loadCases();
const prompts = loadPrompts();
const CASE_ID = [...cases.keys()][0]!;
const AI_LINE = /这份反馈由 AI 生成|AI-generated/;

function makeApp(providerFor?: () => ModelProvider) {
  const events: CountEvent[] = [];
  const pending: Promise<unknown>[] = [];
  const store: MetricsStore = { increment: async (_d, e) => void events.push(e), rows: async () => [] };
  const logger: Logger = { info: () => {}, error: () => {} };
  const counter = createCounter({ store, keepAlive: (p) => pending.push(p), onError: () => {} });
  const app = createApp({ config: loadConfig({ LLM_PROVIDER: "mock" }), cases, prompts, logger, counter, ...(providerFor ? { providerFor } : {}) });
  const flush = async () => {
    for (let i = 0; i < pending.length; i++) await pending[i];
  };
  return { app, events, flush };
}

const session = [
  { role: "counselor", text: "你好，今天想聊点什么？" },
  { role: "client", text: "最近睡不好。" },
  { role: "counselor", text: "能多说说吗？" },
];
const post = (app: ReturnType<typeof makeApp>["app"], body: Record<string, unknown>) =>
  app.request("/supervision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId: CASE_ID, locale: "zh", messages: session, ...body }),
  });

async function text(res: Response) {
  const raw = await res.text();
  const frames = raw
    .split("\n\n")
    .filter((b) => b.startsWith("data: "))
    .map((b) => JSON.parse(b.slice(6)) as { type: string; text?: string });
  return { frames, text: frames.filter((f) => f.type === "text_delta").map((f) => f.text).join("") };
}

describe("mode", () => {
  it("unknown mode → 400 invalid_request; final and no mode are the report", async () => {
    const { app } = makeApp();
    const bad = await post(app, { mode: "summary" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("invalid_request");
    for (const mode of [undefined, "final"]) {
      const { text: t } = await text(await post(app, mode ? { mode } : {}));
      expect(t).toMatch(/^## 做得好的地方/m);
      expect(t).toMatch(AI_LINE);
    }
  });
});

describe("what the model gets", () => {
  it("live: its own prompt, the transcript so far, no case text, low temperature", async () => {
    const mock = new MockProvider([() => ({ text: "- ok", toolCalls: [] })]);
    const { app } = makeApp(() => mock);
    await (await post(app, { mode: "live", durationSec: 300 })).text();
    const req = mock.requests[0]!;
    expect(req.system).toContain("<!-- psygym:supervisor-live -->");
    expect(req.system).not.toContain("<!-- psygym:supervisor -->");
    expect(req.system).toContain("## 督导标准");
    const sent = req.system + JSON.stringify(req.messages);
    const c = cases.get(CASE_ID)!;
    for (const t of [c.title.zh, c.summary.zh, c.clientIntro?.zh].filter(Boolean)) expect(sent).not.toContain(t);
    expect((req.messages[0] as { text: string }).text).toContain("会谈还在进行");
    expect(req.temperature).toBe(SUPERVISOR_TEMPERATURE);
    expect(req.tools).toEqual([]);
  });

  it("the live prompt carries the format rules", () => {
    for (const s of ["**不用标题**", "**最少 1 条，最多 3 条**", "**不写结尾的 AI 声明**", "中文 150–250 字", "**一个字都不改，包括人称**", "〔方括号〕是占位", "对话还很短时，只说已经能看到的"]) {
      expect(prompts.supervisorLive).toContain(s);
    }
    // Risk first, then what went well, then what to try.
    const order = ["1. **风险提醒**", "2. **一条做得好的**", "3. **一条接下来可以试的**"].map((s) => prompts.supervisorLive.indexOf(s));
    expect(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1]!))).toBe(true);
    for (const copied of ["睡不好", "一直绷着", "有点慌"]) expect(prompts.supervisorLive).not.toContain(copied);
  });
});

describe("mock live notes", () => {
  it.each(["zh", "en"])("no headings, 1–3 items, no AI line, a verbatim quote (%s)", async (locale) => {
    const { app } = makeApp();
    const { text: t } = await text(await post(app, { mode: "live", locale }));
    expect(t).not.toMatch(/^#/m);
    const items = t.split("\n").filter((l) => l.startsWith("- "));
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.length).toBeLessThanOrEqual(3);
    expect(t).not.toMatch(AI_LINE);
    expect(t).toContain(locale === "zh" ? "「能多说说吗？」" : "“能多说说吗？”");
    expect(t).toMatch(locale === "zh" ? /可以换成：[^「“]/ : /Try instead: [^「“]/);
  });
});

describe("counts", () => {
  it("live: live_supervision by turn bucket; no report, no duration", async () => {
    const { app, events, flush } = makeApp();
    await (await post(app, { mode: "live", durationSec: 300 })).text();
    await flush();
    expect(events).toEqual([{ metric: "live_supervision", caseId: CASE_ID, locale: "zh", dim: "1-5" }]);
  });

  it("live failing: only error/stream_error, never report_failed", async () => {
    const failing: ModelProvider = {
      name: "x",
      model: "x",
      buildRequest: (r) => r,
      stream: async () => {
        throw new Error("down");
      },
    };
    const { app, events, flush } = makeApp(() => failing);
    const { frames } = await text(await post(app, { mode: "live" }));
    expect(frames.at(-1)?.type).toBe("error");
    await flush();
    expect(events).toEqual([{ metric: "error", dim: "stream_error" }]);
  });

  it("final keeps its counts", async () => {
    const { app, events, flush } = makeApp();
    await (await post(app, { durationSec: 300 })).text();
    await flush();
    expect(events.map((e) => e.metric)).toEqual(["report_generated", "session_duration"]);
  });
});
