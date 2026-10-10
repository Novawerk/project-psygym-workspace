// Copied from Novawerk/agent-starter (MIT), apps/agent/src/llm/mock.ts at fcbd91c.
// https://github.com/Novawerk/agent-starter — changes: import paths (.js), demo replies for 聆镜.
// A fake model that needs no API key: for frontend work, tests, and demoing the whole path
// (streamed text + tool calls + memory updates).
import {
  emptyUsage,
  type AssistantMessage,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type StreamHandlers,
} from "./types.js";

/** One scripted step: given the request, return what the assistant says / which tools it calls */
export type MockStep = (req: ModelRequest) => Pick<AssistantMessage, "text" | "toolCalls"> & { reasoning?: string };

export class MockProvider implements ModelProvider {
  readonly name = "mock";
  readonly model = "mock";
  /** Every request received; tests assert on these */
  readonly requests: ModelRequest[] = [];
  private readonly script: MockStep[] | null;

  /** With a script, replay it step by step (tests); without, use the built-in demo behaviour */
  constructor(script?: MockStep[]) {
    this.script = script ? [...script] : null;
  }

  buildRequest(req: ModelRequest) {
    return { model: this.model, system: req.system, messages: req.messages, tools: req.tools.map((t) => t.name) };
  }

  async stream(req: ModelRequest, handlers: StreamHandlers): Promise<ModelResponse> {
    this.requests.push(req);
    const step = this.script ? this.script.shift() : demoStep;
    if (!step) throw new Error("MockProvider: the script ran out of steps");
    const out = step(req);

    if (out.reasoning) {
      handlers.onReasoning?.(out.reasoning);
    }
    for (const piece of chunk(out.text)) {
      if (req.signal?.aborted) throw new DOMException("aborted", "AbortError");
      handlers.onText?.(piece);
      if (!this.script) await sleep(15);
    }

    const usage = emptyUsage();
    usage.inputTokens = estimate(req);
    usage.outputTokens = Math.ceil(out.text.length / 2);
    return {
      message: { role: "assistant", text: out.text, toolCalls: out.toolCalls, ...(out.reasoning ? { reasoning: out.reasoning } : {}) },
      stopReason: out.toolCalls.length ? "tool_use" : "end_turn",
      usage,
    };
  }
}

/**
 * Demo behaviour for 聆镜: a short in-character line for the AI client, a small Markdown report
 * for the supervisor, with the same three headings and closing line as prompts/supervisor.md.
 * The prompts start with a role marker (<!-- psygym:client|supervisor -->); the language comes
 * from the language line src/session.ts appends.
 */
const demoStep: MockStep = (req) => {
  const en = /Speak English|Write the report in English/.test(req.system);
  if (req.system.includes("<!-- psygym:supervisor -->")) {
    return {
      text: en
        ? "## What went well\n\n- (mock) You asked an open question.\n\n" +
          "## What to improve\n\n- (mock) A quote and a better wording go here.\n\n" +
          "## What to practise next\n\n- (mock) Practise empathic reflections.\n\n" +
          "This feedback is AI-generated, for practice only.\n"
        : "## 做得好的地方\n\n- （mock）你用了开放式提问。\n\n" +
          "## 需要改进的地方\n\n- （mock）这里会引用原话，并给出可以换成的说法。\n\n" +
          "## 下次练什么\n\n- （mock）练习共情回应。\n\n" +
          "这份反馈由 AI 生成，仅供练习参考。\n",
      toolCalls: [],
    };
  }
  return {
    text: en
      ? "(mock client) Um… I don't really know where to start. I just can't get going lately."
      : "（mock 来访者）嗯……我也不知道从哪儿说起，最近就是提不起劲。",
    toolCalls: [],
  };
};

function* chunk(text: string, size = 6) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

function estimate(req: ModelRequest) {
  return Math.ceil((req.system.length + JSON.stringify(req.messages).length) / 3);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
