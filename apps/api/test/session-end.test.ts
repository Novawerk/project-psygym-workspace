// The AI client ending the session: end_session tool call → one session_end frame.
import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createApp, type Logger } from "../src/app.js";
import { loadConfig, type LlmConfig } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import { AnthropicProvider } from "../src/llm/anthropic.js";
import { MOCK_END_TRIGGER, MockProvider } from "../src/llm/mock.js";
import { OpenAICompatibleProvider } from "../src/llm/openai-compatible.js";
import type { ModelProvider, ToolCall } from "../src/llm/types.js";
import { FAREWELL } from "../src/session.js";

const cases = loadCases();
const prompts = loadPrompts();
const CASE_ID = [...cases.keys()][0]!;

function makeApp(providerFor?: () => ModelProvider) {
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const app = createApp({ config: loadConfig({ LLM_PROVIDER: "mock" }), cases, prompts, logger, ...(providerFor ? { providerFor } : {}) });
  return { app, lines };
}

async function frames(app: ReturnType<typeof makeApp>["app"], path: string, text: string, locale = "zh") {
  const res = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId: CASE_ID, locale, messages: [{ role: "counselor", text }] }),
  });
  expect(res.status).toBe(200);
  const body = await res.text();
  return body
    .split("\n\n")
    .filter((b) => b.startsWith("data: "))
    .map((b) => JSON.parse(b.slice(6)) as { type: string; text?: string });
}

/** session_end once, right before turn_end, after all text. */
function expectSessionEnd(fs: { type: string }[]) {
  expect(fs.filter((f) => f.type === "session_end")).toHaveLength(1);
  expect(fs.at(-2)?.type).toBe("session_end");
  expect(fs.at(-1)?.type).toBe("turn_end");
  expect(fs[0]?.type).toBe("turn_start");
  expect(fs.slice(1, -2).every((f) => f.type === "text_delta")).toBe(true);
  expect(fs.slice(1, -2).length).toBeGreaterThan(0);
}

describe("mock: #end", () => {
  it.each(["zh", "en"])("the mock client says goodbye and ends the session (%s)", async (locale) => {
    const { app, lines } = makeApp();
    const fs = await frames(app, "/chat", `你这样真让人受不了 ${MOCK_END_TRIGGER}`, locale);
    expectSessionEnd(fs);
    expect(fs.filter((f) => f.type === "text_delta").map((f) => f.text).join("")).toMatch(/今天先到这里|stop here for today/);
    expect(lines.some((l) => l.msg === "turn" && l.sessionEnd === true)).toBe(true);
  });

  it("no trigger, no session_end", async () => {
    const { app } = makeApp();
    const fs = await frames(app, "/chat", "你好");
    expect(fs.some((f) => f.type === "session_end")).toBe(false);
    expect(fs.at(-1)?.type).toBe("turn_end");
  });

  it("supervision never ends a session", async () => {
    const { app } = makeApp();
    const fs = await frames(app, "/supervision", `你好 ${MOCK_END_TRIGGER}`);
    expect(fs.some((f) => f.type === "session_end")).toBe(false);
  });
});

describe("what the model gets", () => {
  it("/chat offers end_session, /supervision offers no tools", async () => {
    const mock = new MockProvider([
      () => ({ text: "嗯", toolCalls: [] }),
      () => ({ text: "ok", toolCalls: [] }),
    ]);
    const { app } = makeApp(() => mock);
    await frames(app, "/chat", "你好");
    await frames(app, "/supervision", "你好");
    expect(mock.requests[0]!.tools.map((t) => t.name)).toEqual(["end_session"]);
    expect(mock.requests[0]!.system).toContain("end_session");
    expect(mock.requests[1]!.tools).toEqual([]);
  });
});

describe("tool calls become one frame", () => {
  const end: ToolCall = { id: "t1", name: "end_session", args: {} };

  it("two end_session calls still make one session_end", async () => {
    const { app } = makeApp(() => new MockProvider([() => ({ text: "我先走了。", toolCalls: [end, { ...end, id: "t2" }] })]));
    expectSessionEnd(await frames(app, "/chat", "你好"));
  });

  it.each(["zh", "en"] as const)("a call with no closing line gets one, in the session's language (%s)", async (locale) => {
    const { app } = makeApp(() => new MockProvider([() => ({ text: "", toolCalls: [end] })]));
    const fs = await frames(app, "/chat", "你好", locale);
    expectSessionEnd(fs);
    expect(fs[1]).toEqual({ type: "text_delta", text: FAREWELL[locale] });
  });

  it("an unknown tool name is ignored", async () => {
    const { app } = makeApp(() => new MockProvider([() => ({ text: "嗯", toolCalls: [{ id: "x", name: "something_else", args: {} }] })]));
    const fs = await frames(app, "/chat", "你好");
    expect(fs.some((f) => f.type === "session_end")).toBe(false);
  });

  it("whitespace isn't a closing line: the server adds one", async () => {
    const { app } = makeApp(() => new MockProvider([() => ({ text: "\n  ", toolCalls: [end] })]));
    const fs = await frames(app, "/chat", "你好");
    expectSessionEnd(fs);
    expect(fs.filter((f) => f.type === "text_delta").at(-1)).toEqual({ type: "text_delta", text: FAREWELL.zh });
  });

  it.each([
    ["only an unknown tool call", { text: "", toolCalls: [{ id: "x", name: "something_else", args: {} }] }],
    ["no text at all", { text: "", toolCalls: [] }],
    ["whitespace only", { text: " \n", toolCalls: [] }],
  ])("%s → an error frame, never an empty reply", async (_, step) => {
    const { app, lines } = makeApp(() => new MockProvider([() => step]));
    const fs = await frames(app, "/chat", "你好");
    expect(fs.at(-1)).toEqual({ type: "error", code: "model_unavailable", message: expect.any(String) });
    expect(fs.some((f) => f.type === "turn_end" || f.type === "session_end")).toBe(false);
    expect(lines.some((l) => l.msg === "turn failed" && l.error === "EmptyReplyError")).toBe(true);
  });

  it("an empty supervision report is an error too", async () => {
    const { app } = makeApp(() => new MockProvider([() => ({ text: "", toolCalls: [] })]));
    const fs = await frames(app, "/supervision", "你好");
    expect(fs.at(-1)?.type).toBe("error");
  });
});

// ── The real adapters, against a fake vendor on localhost ──

const servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** A one-route fake vendor: records request bodies, answers with the given SSE lines. */
async function fakeVendor(sse: string[]) {
  const bodies: Record<string, unknown>[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      bodies.push(JSON.parse(raw));
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const line of sse) res.write(`${line}\n\n`);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, bodies };
}

const llm = (provider: LlmConfig["provider"], model: string, baseURL: string): LlmConfig => ({
  provider,
  model,
  baseURL,
  apiKey: "test-key",
  maxOutputTokens: 1000,
  anthropicEffort: "low",
});

describe("real adapters turn end_session into session_end", () => {
  it("OpenAI-compatible (DeepSeek)", async () => {
    const chunk = (delta: object, finish: string | null = null, usage?: object) =>
      `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}`;
    const vendor = await fakeVendor([
      chunk({ role: "assistant", content: "我想今天" }),
      chunk({ content: "先到这里。" }),
      chunk({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "end_session", arguments: "" } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: "{}" } }] }),
      chunk({}, "tool_calls"),
      `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "deepseek-chat", choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}`,
      "data: [DONE]",
    ]);
    const provider = new OpenAICompatibleProvider(llm("deepseek", "deepseek-chat", vendor.url));
    const { app } = makeApp(() => provider);
    const fs = await frames(app, "/chat", "你好");
    expectSessionEnd(fs);
    expect(fs.filter((f) => f.type === "text_delta").map((f) => f.text).join("")).toBe("我想今天先到这里。");
    expect(fs.at(-1)).toEqual({ type: "turn_end", usage: { inputTokens: 10, outputTokens: 5 } });
    const sent = vendor.bodies[0] as { tools: { function: { name: string } }[] };
    expect(sent.tools.map((t) => t.function.name)).toEqual(["end_session"]);
  });

  it("Anthropic", async () => {
    const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}`;
    const vendor = await fakeVendor([
      ev("message_start", {
        message: { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 } },
      }),
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "I'd like to stop here." } }),
      ev("content_block_stop", { index: 0 }),
      ev("content_block_start", { index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "end_session", input: {} } }),
      ev("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: "{}" } }),
      ev("content_block_stop", { index: 1 }),
      ev("message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 7 } }),
      ev("message_stop", {}),
    ]);
    const provider = new AnthropicProvider(llm("anthropic", "claude-sonnet-5-5", vendor.url));
    const { app } = makeApp(() => provider);
    const fs = await frames(app, "/chat", "hello", "en");
    expectSessionEnd(fs);
    expect(fs.filter((f) => f.type === "text_delta").map((f) => f.text).join("")).toBe("I'd like to stop here.");
    const sent = vendor.bodies[0] as { tools: { name: string }[]; thinking?: { type: string } };
    expect(sent.tools.map((t) => t.name)).toEqual(["end_session"]);
    // Thinking stays on; no forced tool choice (current Claude models reject "any"/"tool").
    expect(sent.thinking?.type).toBe("adaptive");
    expect(sent).not.toHaveProperty("tool_choice");
  });
});
