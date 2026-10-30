// Voice sessions through ElevenLabs (docs/decisions/0013-voice-elevenlabs.md).
import { describe, expect, it } from "vitest";

import { createApp, type Logger } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import { MOCK_END_TRIGGER } from "../src/llm/mock.js";
import type { ModelProvider, ModelRequest } from "../src/llm/types.js";
import { SILENCE, TURN_LENGTHS, VOICE_ERROR_LINE, isClosingLine, lengthNote, turnLength, voiceTurn } from "../src/voice.js";

const cases = loadCases();
const prompts = loadPrompts();
const CASE_ID = [...cases.keys()][0]!;
const SECRET = "s".repeat(32);
const VOICE_ENV = { LLM_PROVIDER: "mock", ELEVENLABS_API_KEY: "xi-key", ELEVENLABS_AGENT_ID: "agent_1", VOICE_LLM_SECRET: SECRET };

function makeApp(env: Record<string, string> = VOICE_ENV, extra: { providerFor?: () => ModelProvider; fetch?: typeof fetch } = {}) {
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const app = createApp({ config: loadConfig(env), cases, prompts, logger, ...extra });
  return { app, lines };
}

const END_CALL_TOOL = { type: "function", function: { name: "end_call", parameters: {} } };

function llmBody(messages: { role: string; content: string }[], extra: Record<string, unknown> = {}) {
  return {
    model: "psygym",
    stream: true,
    messages: [{ role: "system", content: "ElevenLabs prompt. case=" + CASE_ID + " locale=zh" }, ...messages],
    tools: [END_CALL_TOOL],
    ...extra,
  };
}

async function llm(app: ReturnType<typeof makeApp>["app"], body: unknown, secret = SECRET, path = "/voice/llm/chat/completions") {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
}

type Chunk = { choices: { delta: { content?: string; tool_calls?: { function: { name: string } }[] }; finish_reason: string | null }[] };

async function chunks(res: Response) {
  const datas = (await res.text())
    .split("\n\n")
    .filter((b) => b.startsWith("data: "))
    .map((b) => b.slice(6));
  expect(datas.at(-1)).toBe("[DONE]");
  const cs = datas.slice(0, -1).map((d) => JSON.parse(d) as Chunk);
  const text = cs.map((c) => c.choices[0]!.delta.content ?? "").join("");
  const calls = cs.flatMap((c) => c.choices[0]!.delta.tool_calls ?? []).map((t) => t.function.name);
  return { text, calls, finish: cs.at(-1)!.choices[0]!.finish_reason };
}

describe("voiceTurn", () => {
  it("maps user/assistant to counselor/client, merges runs and drops system and tool messages", () => {
    const t = voiceTurn({
      messages: [
        { role: "system", content: "x case=a-1 locale=en y" },
        { role: "user", content: "Hi." },
        { role: "user", content: [{ type: "text", text: "How are you?" }] },
        { role: "tool", content: "ok" },
        { role: "assistant", content: "Fine." },
        { role: "assistant", content: "" },
      ],
    });
    expect(t).toEqual({ caseId: "a-1", locale: "en", messages: [{ role: "counselor", text: "Hi. How are you?" }, { role: "client", text: "Fine." }], canEndCall: false });
  });

  it("the trainee's silence (ElevenLabs sends '...') reaches the client as the counselor waiting", () => {
    const t = voiceTurn({
      messages: [
        { role: "system", content: "case=a-1 locale=zh" },
        { role: "user", content: "随便说说就好。" },
        { role: "assistant", content: "最近挺累的。" },
        { role: "user", content: "..." },
      ],
    });
    expect(t?.messages.at(-1)).toEqual({ role: "counselor", text: SILENCE.zh });
    expect(voiceTurn({ messages: [{ role: "system", content: "case=a locale=en" }, { role: "user", content: " … " }] })?.messages).toEqual([{ role: "counselor", text: SILENCE.en }]);
    expect(voiceTurn({ messages: [{ role: "system", content: "case=a locale=zh" }, { role: "user", content: "嗯……" }] })?.messages).toEqual([{ role: "counselor", text: "嗯……" }]);
  });

  it("extra_body wins over the marker; neither: null", () => {
    expect(voiceTurn({ messages: [{ role: "system", content: "case=a locale=zh" }], elevenlabs_extra_body: { caseId: "b", locale: "en" } })).toMatchObject({ caseId: "b", locale: "en" });
    expect(voiceTurn({ messages: [{ role: "user", content: "hi" }] })).toBeNull();
  });
});

describe("how long a voice turn runs", () => {
  it("draws from the real distribution; the first lines stay short", () => {
    expect(turnLength(5, 0)).toBe(TURN_LENGTHS[0]);
    expect(turnLength(5, 0.999)).toBe(TURN_LENGTHS.at(-1));
    expect(turnLength(1, 0.999)).toBe(150);
  });

  it("a short turn says stop, a long one says keep going", () => {
    expect(lengthNote("zh", 17)).toContain("最多 17 字");
    expect(lengthNote("zh", 712)).toContain("必须说够");
    expect(lengthNote("en", 712)).toContain("356 words");
    expect(lengthNote("zh", 712)).toContain("绝不说过程和细节");
    for (const chars of [17, 100, 712]) expect(lengthNote("zh", chars)).toContain("一定调用 end_session");
    expect(lengthNote("zh", 712, 0.05)).toContain("反问");
    expect(lengthNote("zh", 712, 0.5)).not.toContain("反问");
  });

  it("reaches the model with the voice note", async () => {
    let asked: ModelRequest | undefined;
    const provider = {
      name: "mock",
      model: "x",
      buildRequest: () => ({}),
      stream: async (req: ModelRequest, h: { onText?: (t: string) => void }) => {
        asked = req;
        h.onText?.("嗯");
        return { message: { text: "嗯", toolCalls: [] }, usage: { inputTokens: 0, outputTokens: 0 } };
      },
    } as unknown as ModelProvider;
    const app = createApp({ config: loadConfig(VOICE_ENV), cases, prompts, logger: { info: () => {}, error: () => {} }, providerFor: () => provider, random: () => 0.9 });
    const lines = [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }, { role: "assistant", content: "d" }, { role: "user", content: "e" }];
    await (await llm(app, llmBody(lines))).text();
    expect(asked!.system).toContain("语音会谈");
    expect(JSON.stringify(asked!.messages.at(-1))).toContain(`${Math.round(TURN_LENGTHS[18]! * 0.9)} 字`);
  });
});

describe("a closing line without end_session", () => {
  it("knows the line, and only the whole line", () => {
    for (const t of ["我想今天先到这里。", "今天先到这里吧", "我先走了。", "我想今天先到这里。我先走了。", "I think that's enough for today."]) expect(isClosingLine(t)).toBe(true);
    for (const t of ["今天先到这里吧，但是我还想说一件事", "我先走了两步，然后回头看", "我想今天先把作业写了。"]) expect(isClosingLine(t)).toBe(false);
  });
});

describe("POST /voice/llm/chat/completions", () => {
  it("is 404 when voice is off, also with half the variables set (config error)", async () => {
    const off = makeApp({ LLM_PROVIDER: "mock" });
    expect((await llm(off.app, llmBody([{ role: "user", content: "你好" }]))).status).toBe(404);
    const c = loadConfig({ LLM_PROVIDER: "mock", ELEVENLABS_API_KEY: "k" });
    expect(c.voice).toBeNull();
    expect(c.errors.join()).toMatch(/needed together/);
    expect(loadConfig({ ...VOICE_ENV, VOICE_LLM_SECRET: "short" }).voice).toBeNull();
  });

  it("needs the secret", async () => {
    const { app } = makeApp();
    expect((await llm(app, llmBody([{ role: "user", content: "你好" }]), "wrong")).status).toBe(401);
  });

  it("answers as the client, OpenAI chunks, on both paths; uses our prompt, not ElevenLabs'", async () => {
    let seen: Omit<ModelRequest, "signal"> | undefined;
    const provider: ModelProvider = {
      name: "scripted",
      model: "m",
      buildRequest: (r) => r,
      async stream(req, h) {
        seen = req;
        h.onText?.("嗯……");
        h.onText?.("最近睡不好。");
        return { message: { role: "assistant", text: "嗯……最近睡不好。", toolCalls: [] }, stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } };
      },
    };
    const { app, lines } = makeApp(VOICE_ENV, { providerFor: () => provider });
    for (const path of ["/voice/llm/chat/completions", "/voice/llm/v1/chat/completions"]) {
      const res = await llm(app, llmBody([{ role: "user", content: "你好，今天想聊什么？" }]), SECRET, path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
      expect(await chunks(res)).toEqual({ text: "嗯……最近睡不好。", calls: [], finish: "stop" });
    }
    expect(seen!.system).toContain(cases.get(CASE_ID)!.brief.slice(0, 40));
    expect(seen!.system).toContain("语音会谈");
    expect(seen!.system).not.toContain("ElevenLabs prompt");
    expect(seen!.messages).toHaveLength(1);
    expect(JSON.stringify(seen!.messages[0])).toContain("你好，今天想聊什么？");
    // No conversation text in the logs.
    expect(JSON.stringify(lines)).not.toContain("睡不好");
    expect(JSON.stringify(lines)).not.toContain("今天想聊");
  });

  it("end_session becomes ElevenLabs' end_call after the closing line", async () => {
    const { app } = makeApp();
    const r = await chunks(await llm(app, llmBody([{ role: "user", content: `你真矫情 ${MOCK_END_TRIGGER}` }])));
    expect(r.text).toMatch(/今天先到这里/);
    expect(r.calls).toEqual(["end_call"]);
    expect(r.finish).toBe("tool_calls");
  });

  it("no end_call offered: the closing line is spoken, no tool call", async () => {
    const { app } = makeApp();
    const r = await chunks(await llm(app, llmBody([{ role: "user", content: `你真矫情 ${MOCK_END_TRIGGER}` }], { tools: [] })));
    expect(r.calls).toEqual([]);
    expect(r.finish).toBe("stop");
  });

  it("a model failure is spoken as a line asking to repeat, never a broken stream", async () => {
    const provider: ModelProvider = { name: "broken", model: "m", buildRequest: (r) => r, stream: async () => Promise.reject(new Error("boom")) };
    const { app } = makeApp(VOICE_ENV, { providerFor: () => provider });
    const r = await chunks(await llm(app, llmBody([{ role: "user", content: "你好" }])));
    expect(r.text).toBe(VOICE_ERROR_LINE.zh);
  });

  it("a request ElevenLabs drops is not counted as a turn, even when the model stream ends quietly", async () => {
    const quiet = {
      name: "mock",
      model: "quiet",
      buildRequest: () => ({}),
      stream: (req: ModelRequest) =>
        new Promise((resolve) => {
          req.signal!.addEventListener("abort", () => resolve({ message: { text: "", toolCalls: [] }, usage: { inputTokens: 0, outputTokens: 0 } }));
        }),
    } as unknown as ModelProvider;
    const { app, lines } = makeApp(VOICE_ENV, { providerFor: () => quiet });
    const res = await llm(app, llmBody([{ role: "user", content: "你好" }]));
    await new Promise((r) => setTimeout(r, 10));
    await res.body!.cancel();
    await new Promise((r) => setTimeout(r, 10));
    expect(lines.map((l) => l.msg)).toContain("turn aborted");
    expect(lines.map((l) => l.msg)).not.toContain("turn");
  });

  it("no case or language: 400; unknown case: 404", async () => {
    const { app } = makeApp();
    expect((await llm(app, { messages: [{ role: "user", content: "hi" }] })).status).toBe(400);
    expect((await llm(app, { messages: [{ role: "system", content: "case=nope locale=zh" }, { role: "user", content: "hi" }] })).status).toBe(404);
  });
});

describe("GET /voice/status", () => {
  it("says the feature is on, 404 when off, behind the gate", async () => {
    expect(await (await makeApp().app.request("/voice/status")).json()).toEqual({ available: true });
    expect((await makeApp({ LLM_PROVIDER: "mock" }).app.request("/voice/status")).status).toBe(404);
    expect((await makeApp({ ...VOICE_ENV, INVITE_CODES: "abc" }).app.request("/voice/status")).status).toBe(401);
  });
});

describe("POST /voice/session", () => {
  it("mints a token with the server's key and tells the app what to pass", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ token: "tok_1", conversation_id: "conv_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const { app } = makeApp(VOICE_ENV, { fetch: fakeFetch });
    const res = await app.request("/voice/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: CASE_ID, locale: "zh" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversationToken: "tok_1",
      dynamicVariables: { psygym: `case=${CASE_ID} locale=zh` },
      extraBody: { caseId: CASE_ID, locale: "zh" },
    });
    expect(calls[0]!.url).toBe("https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent_1");
    expect(new Headers(calls[0]!.init.headers).get("xi-api-key")).toBe("xi-key");
  });

  it("is behind the invite gate, 404 when off, 503 when ElevenLabs fails", async () => {
    const gated = makeApp({ ...VOICE_ENV, INVITE_CODES: "abc" });
    const body = JSON.stringify({ caseId: CASE_ID, locale: "zh" });
    expect((await gated.app.request("/voice/session", { method: "POST", headers: { "Content-Type": "application/json" }, body })).status).toBe(401);
    const off = makeApp({ LLM_PROVIDER: "mock" });
    expect((await off.app.request("/voice/session", { method: "POST", headers: { "Content-Type": "application/json" }, body })).status).toBe(404);
    const failing = makeApp(VOICE_ENV, { fetch: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch });
    expect((await failing.app.request("/voice/session", { method: "POST", headers: { "Content-Type": "application/json" }, body })).status).toBe(503);
  });
});
