// A model that writes the end_session call into its reply as a tag: the server strips the tag
// and ends the session as if the tool had been called.
import { describe, expect, it } from "vitest";

import { createApp, type Logger } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import { EndTagFilter } from "../src/end-tag.js";
import { emptyUsage, type ModelProvider, type ModelRequest, type ModelResponse, type StreamHandlers } from "../src/llm/types.js";

/** Runs `deltas` through a filter, returns what went out. */
function run(deltas: string[]) {
  const f = new EndTagFilter();
  const out = deltas.map((d) => f.push(d)).join("") + f.flush();
  return { out, found: f.found };
}

/** Every way to cut `text` into two deltas, plus one character at a time. */
function splits(text: string): string[][] {
  const chars = [...text];
  const two = chars.map((_, i) => [chars.slice(0, i).join(""), chars.slice(i).join("")]);
  return [...two, chars];
}

describe("EndTagFilter", () => {
  const seen = "<end_session>\n\n我想今天先到这里。</end_session>";

  it("strips the tags the model wrote in C, however the stream is cut", () => {
    for (const deltas of splits(seen)) expect(run(deltas)).toEqual({ out: "我想今天先到这里。", found: true });
  });

  it.each([
    "＜end_session＞我想今天先到这里。＜/end_session＞",
    "< end_session >我想今天先到这里。< / end_session >",
    "<END_SESSION/>我想今天先到这里。",
    "我想今天先到这里。<end session>",
    "我想今天先到这里。</endsession>",
  ])("variant %s", (text) => {
    for (const deltas of splits(text)) expect(run(deltas)).toEqual({ out: "我想今天先到这里。", found: true });
  });

  it("leaves ordinary text alone, including stray brackets", () => {
    for (const text of ["嗯……我也不知道。", "a < b, and <end> is not a tag", "<end_sessions>", "＜", "<end_sess"]) {
      for (const deltas of splits(text)) expect(run(deltas)).toEqual({ out: text, found: false });
    }
  });

  it("holds back only what could still become a tag", () => {
    const f = new EndTagFilter();
    expect(f.push("我想今天")).toBe("我想今天");
    expect(f.push("先到这里。<end_")).toBe("先到这里。");
    expect(f.push("session>")).toBe("");
    expect(f.found).toBe(true);
    expect(f.flush()).toBe("");
  });
});

/** A provider that streams the given deltas and calls no tool. */
function textOnly(deltas: string[]): ModelProvider {
  return {
    name: "mock",
    model: "tags",
    buildRequest: () => ({}),
    async stream(_req: ModelRequest, h: StreamHandlers): Promise<ModelResponse> {
      for (const d of deltas) h.onText?.(d);
      return {
        message: { role: "assistant", text: deltas.join(""), toolCalls: [] },
        stopReason: "end_turn",
        usage: emptyUsage(),
      };
    },
  };
}

const cases = loadCases();
const prompts = loadPrompts();
const CASE_ID = [...cases.keys()][0]!;

async function framesFor(path: string, provider: ModelProvider) {
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const app = createApp({ config: loadConfig({ LLM_PROVIDER: "mock" }), cases, prompts, logger, providerFor: () => provider });
  const res = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId: CASE_ID, locale: "zh", messages: [{ role: "counselor", text: "你好" }] }),
  });
  const body = await res.text();
  const frames = body
    .split("\n\n")
    .filter((b) => b.startsWith("data: "))
    .map((b) => JSON.parse(b.slice(6)) as { type: string; text?: string });
  return { frames, lines };
}

describe("/chat with the end tag in the text", () => {
  it("sends the closing line without tags, then session_end", async () => {
    const { frames, lines } = await framesFor("/chat", textOnly(["<end_", "session>\n\n我想今天先", "到这里。</end_ses", "sion>"]));
    const text = frames.filter((f) => f.type === "text_delta").map((f) => f.text).join("");
    expect(text).toBe("我想今天先到这里。");
    expect(frames.map((f) => f.type).slice(-2)).toEqual(["session_end", "turn_end"]);
    expect(lines.find((l) => l.msg === "turn")).toMatchObject({ sessionEnd: true, endTagInText: true });
  });

  it("no tag, no session_end", async () => {
    const { frames } = await framesFor("/chat", textOnly(["嗯……", "我也不知道。"]));
    expect(frames.some((f) => f.type === "session_end")).toBe(false);
  });

  it("the supervisor's text is never filtered (no tool there)", async () => {
    const { frames } = await framesFor("/supervision", textOnly(["报告 <end_session>"]));
    expect(frames.filter((f) => f.type === "text_delta").map((f) => f.text).join("")).toBe("报告 <end_session>");
    expect(frames.some((f) => f.type === "session_end")).toBe(false);
  });
});
