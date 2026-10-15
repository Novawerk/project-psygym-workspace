// END_SESSION_JUDGE: an end_session call ends the session only when an independent check agrees.
import { describe, expect, it } from "vitest";

import { createApp, type Logger } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import { HOLD_MAX_CHARS, NEUTRAL_LINE, REGENERATE_NOTE, ShortHold, harmfulCount, judgeRequest } from "../src/end-judge.js";
import { MOCK_END_TRIGGER, MockProvider, type MockStep } from "../src/llm/mock.js";
import type { ModelProvider, ModelRequest, ToolCall } from "../src/llm/types.js";
import type { Message } from "../src/schema.js";
import { FAREWELL } from "../src/session.js";

const cases = loadCases();
const prompts = loadPrompts();
const CASE_ID = [...cases.keys()][0]!;
const END: ToolCall = { id: "e1", name: "end_session", args: {} };

/** Counselor, client, counselor, client, counselor: messages 1, 3 and 5 are the counselor's. */
const MESSAGES: Message[] = [
  { role: "counselor", text: "你好，今天想聊点什么？" },
  { role: "client", text: "最近挺累的。" },
  { role: "counselor", text: "别难过了，你还年轻，路还长着呢。" },
  { role: "client", text: "嗯……" },
  { role: "counselor", text: "睡前别玩手机，可以听听白噪音。" },
];

function makeApp(opts: { judge: boolean; client: MockStep[] | ModelProvider; checker?: MockStep[] | ModelProvider; judgeTimeoutMs?: number }) {
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const client = Array.isArray(opts.client) ? new MockProvider(opts.client) : opts.client;
  const checker = opts.checker === undefined ? new MockProvider([]) : Array.isArray(opts.checker) ? new MockProvider(opts.checker) : opts.checker;
  const env: Record<string, string> = { LLM_PROVIDER: "mock", ...(opts.judge ? { END_SESSION_JUDGE: "on" } : {}) };
  const app = createApp({
    config: loadConfig(env),
    cases,
    prompts,
    logger,
    providerFor: (role) => (role === "client" ? client : checker),
    ...(opts.judgeTimeoutMs ? { judgeTimeoutMs: opts.judgeTimeoutMs } : {}),
  });
  return { app, lines, client, checker };
}

async function chat(app: ReturnType<typeof makeApp>["app"], messages: Message[] = MESSAGES) {
  const res = await app.request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId: CASE_ID, locale: "zh", messages }),
  });
  expect(res.status).toBe(200);
  const frames = (await res.text())
    .split("\n\n")
    .filter((b) => b.startsWith("data: "))
    .map((b) => JSON.parse(b.slice(6)) as { type: string; text?: string });
  const text = frames.filter((f) => f.type === "text_delta").map((f) => f.text).join("");
  return { frames, text, types: frames.map((f) => f.type) };
}

const says = (text: string, toolCalls: ToolCall[] = []): MockStep => () => ({ text, toolCalls });
const finds = (...harmful: number[]): MockStep => () => ({ text: JSON.stringify({ harmful }), toolCalls: [] });

describe("ShortHold", () => {
  it("holds one short sentence until the end", () => {
    const h = new ShortHold();
    expect(h.push("我想今天")).toBe("");
    expect(h.push("先到这里。")).toBe("");
    expect(h.released).toBe(false);
    expect(h.take()).toBe("我想今天先到这里。");
  });

  it("lets go once a second sentence starts", () => {
    const h = new ShortHold();
    expect(h.push("嗯。")).toBe("");
    expect(h.push("我")).toBe("嗯。我");
    expect(h.released).toBe(true);
    expect(h.push("也不知道")).toBe("我也不知道".slice(1));
  });

  it("lets go past the length limit", () => {
    const h = new ShortHold();
    const long = "就".repeat(HOLD_MAX_CHARS + 1);
    expect(h.push(long)).toBe(long);
    expect(h.released).toBe(true);
  });

  it("closing punctuation runs are still the first sentence", () => {
    const h = new ShortHold();
    expect(h.push("就是……")).toBe("");
    expect(h.push("」")).toBe("");
    expect(h.released).toBe(false);
  });
});

describe("harmfulCount", () => {
  it("counts different counselor messages only", () => {
    expect(harmfulCount('{"harmful":[3,5]}', MESSAGES)).toBe(2);
    expect(harmfulCount('{"harmful":[3,3]}', MESSAGES)).toBe(1);
    expect(harmfulCount('{"harmful":[2,4,9,0,"3"]}', MESSAGES)).toBe(0);
    expect(harmfulCount('好的：{"harmful":[1]}', MESSAGES)).toBe(1);
  });

  it("throws on anything else", () => {
    expect(() => harmfulCount("两句", MESSAGES)).toThrow();
    expect(() => harmfulCount('{"count":2}', MESSAGES)).toThrow();
  });

  it("the check reads the end-judge prompt and a numbered transcript", () => {
    const r = judgeRequest(prompts, "zh", MESSAGES);
    expect(r.system).toContain("<!-- psygym:end-judge -->");
    expect(r.tools).toEqual([]);
    expect(r.temperature).toBe(0);
    expect((r.messages[0] as { text: string }).text).toContain("[3] 咨询师：别难过了，你还年轻，路还长着呢。");
  });
});

describe("END_SESSION_JUDGE off (the default): the stream is unchanged", () => {
  it("streams every delta as it comes and ends on end_session, with no check", async () => {
    const { app, checker } = makeApp({ judge: false, client: [says("我想今天先到这里。", [END])] });
    const { frames, text, types } = await chat(app);
    expect(text).toBe("我想今天先到这里。");
    // MockProvider sends 6 characters per delta: none were held back or merged.
    expect(frames.filter((f) => f.type === "text_delta").map((f) => f.text)).toEqual(["我想今天先到", "这里。"]);
    expect(types.slice(-2)).toEqual(["session_end", "turn_end"]);
    expect((checker as MockProvider).requests).toHaveLength(0);
  });

  it("an invalid value is off too", () => {
    expect(loadConfig({ LLM_PROVIDER: "mock", END_SESSION_JUDGE: "true" }).endSessionJudge).toBe(false);
    expect(loadConfig({ LLM_PROVIDER: "mock" }).endSessionJudge).toBe(false);
    expect(loadConfig({ LLM_PROVIDER: "mock", END_SESSION_JUDGE: "on" }).endSessionJudge).toBe(true);
  });

  it("/supervision never runs the check, even with it on", async () => {
    const { app, checker } = makeApp({ judge: true, client: [], checker: [says("## 做得好的地方\n\n- 好。")] });
    const res = await app.request("/supervision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: CASE_ID, locale: "zh", messages: MESSAGES }),
    });
    expect(await res.text()).toContain('"type":"turn_end"');
    expect((checker as MockProvider).requests).toHaveLength(1);
    expect((checker as MockProvider).requests[0]!.system).not.toContain("psygym:end-judge");
  });
});

describe("END_SESSION_JUDGE on", () => {
  it("an ordinary reply streams as usual and runs no check", async () => {
    const reply = "嗯……我也不知道从哪儿说起。就是最近家里的事挺多的，我一直挺累的。";
    const { app, checker } = makeApp({ judge: true, client: [says(reply)] });
    const { text, types } = await chat(app);
    expect(text).toBe(reply);
    expect(types).not.toContain("session_end");
    expect((checker as MockProvider).requests).toHaveLength(0);
  });

  it("a short reply without the tool comes out whole at the end", async () => {
    const { app } = makeApp({ judge: true, client: [says("嗯……")] });
    expect((await chat(app)).text).toBe("嗯……");
  });

  it("the check agrees: the closing line, then session_end", async () => {
    const { app, lines } = makeApp({ judge: true, client: [says("我想今天先到这里。", [END])], checker: [finds(3, 5)] });
    const { text, types } = await chat(app);
    expect(text).toBe("我想今天先到这里。");
    expect(types.slice(-2)).toEqual(["session_end", "turn_end"]);
    expect(lines.find((l) => l.msg === "turn")).toMatchObject({ sessionEnd: true, endJudge: "confirmed", harmfulCount: 2 });
  });

  it("the check agrees on a tag in the text, too", async () => {
    const { app } = makeApp({ judge: true, client: [says("<end_session>我想今天先到这里。</end_session>")], checker: [finds(3, 5)] });
    const { text, types } = await chat(app);
    expect(text).toBe("我想今天先到这里。");
    expect(types.slice(-2)).toEqual(["session_end", "turn_end"]);
  });

  it("the tool without a line, confirmed: the farewell line", async () => {
    const { app } = makeApp({ judge: true, client: [says("", [END])], checker: [finds(3, 5)] });
    const { text, types } = await chat(app);
    expect(text).toBe(FAREWELL.zh);
    expect(types.slice(-2)).toEqual(["session_end", "turn_end"]);
  });

  it("the check disagrees: the closing line never goes out; a second reply, without the tool, does", async () => {
    const { app, client, lines } = makeApp({
      judge: true,
      client: [says("我想今天先到这里。", [END]), says("嗯……可能吧，但我也不是不想睡。")],
      checker: [finds(3)],
    });
    const { text, types } = await chat(app);
    expect(text).toBe("嗯……可能吧，但我也不是不想睡。");
    expect(text).not.toContain("先到这里");
    expect(types).not.toContain("session_end");
    expect(types.at(-1)).toBe("turn_end");
    const again = (client as MockProvider).requests[1]!;
    expect(again.tools).toEqual([]);
    expect(again.system).toContain(REGENERATE_NOTE.zh);
    expect(lines.find((l) => l.msg === "turn")).toMatchObject({ endJudge: "rejected", harmfulCount: 1, regenerated: true });
    expect(lines.find((l) => l.msg === "turn")).not.toHaveProperty("sessionEnd");
  });

  it("an unreadable answer from the check: no end", async () => {
    const { app, lines } = makeApp({ judge: true, client: [says("我想今天先到这里。", [END]), says("嗯。")], checker: [says("两句都算")] });
    const { text, types } = await chat(app);
    expect(text).toBe("嗯。");
    expect(types).not.toContain("session_end");
    expect(lines.find((l) => l.msg === "turn")).toMatchObject({ endJudge: "error" });
  });

  it("a check that takes too long: no end", async () => {
    const slow: ModelProvider = {
      name: "mock",
      model: "slow",
      buildRequest: () => ({}),
      stream: (req: ModelRequest) =>
        new Promise((_, reject) => req.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    };
    const { app, lines } = makeApp({ judge: true, client: [says("我想今天先到这里。", [END]), says("嗯。")], checker: slow, judgeTimeoutMs: 30 });
    const { text, types } = await chat(app);
    expect(text).toBe("嗯。");
    expect(types).not.toContain("session_end");
    expect(lines.find((l) => l.msg === "turn")).toMatchObject({ endJudge: "error", regenerated: true });
  });

  it("the second try fails or says nothing: a neutral line, no end", async () => {
    for (const second of [says(""), () => { throw new Error("down"); }] as MockStep[]) {
      const { app } = makeApp({ judge: true, client: [says("我想今天先到这里。", [END]), second], checker: [finds()] });
      const { text, types } = await chat(app);
      expect(text).toBe(NEUTRAL_LINE.zh);
      expect(types).not.toContain("session_end");
      expect(types.at(-1)).toBe("turn_end");
    }
  });

  it("a long reply that ends with the tool: its text stays, session_end only if confirmed", async () => {
    const reply = "我其实一直都挺努力的，可是你这么说，我真的不知道还要不要说下去。我想今天先到这里。";
    const rejected = makeApp({ judge: true, client: [says(reply, [END])], checker: [finds(3)] });
    const r = await chat(rejected.app);
    expect(r.text).toBe(reply);
    expect(r.types).not.toContain("session_end");
    expect(rejected.lines.find((l) => l.msg === "turn")).toMatchObject({ endJudge: "rejected", late: true });

    const confirmed = makeApp({ judge: true, client: [says(reply, [END])], checker: [finds(3, 5)] });
    expect((await chat(confirmed.app)).types.slice(-2)).toEqual(["session_end", "turn_end"]);
  });

  it("the built-in mock: #end in one message doesn't end, in two it does", async () => {
    const once = makeApp({ judge: true, client: new MockProvider(), checker: new MockProvider() });
    const one = await chat(once.app, [{ role: "counselor", text: `你好 ${MOCK_END_TRIGGER}` }]);
    expect(one.types).not.toContain("session_end");

    const twice = makeApp({ judge: true, client: new MockProvider(), checker: new MockProvider() });
    const two = await chat(twice.app, [
      { role: "counselor", text: `你好 ${MOCK_END_TRIGGER}` },
      { role: "client", text: "嗯。" },
      { role: "counselor", text: `再说一遍 ${MOCK_END_TRIGGER}` },
    ]);
    expect(two.types.slice(-2)).toEqual(["session_end", "turn_end"]);
  });
});
