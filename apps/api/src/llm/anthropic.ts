// Copied from Novawerk/agent-starter (MIT), apps/agent/src/llm/anthropic.ts at fcbd91c.
// https://github.com/Novawerk/agent-starter — changes: import paths (.js), LlmConfig comes from ../config.js,
// ModelRequest.temperature (only where the model accepts it), no retry after a failed stream (a retry would repeat text already sent to the app).
// Claude adapter (native Anthropic SDK).
//
// Where it differs from the OpenAI-compatible adapter, it is to give Claude its full feature set:
// - assistant messages replay their native content (signed thinking blocks) — only for the same model;
//   after a model switch they fall back to text/tool_use;
// - top-level cache_control caches the longest prefix automatically. The harness keeps system/tools
//   frozen and the history append-only, so the cache keeps hitting;
// - tools use eager_input_streaming; the ToolRegistry validates arguments with zod again anyway;
// - newer models get server-side fallback: if a safety classifier refuses, the server retries on another model.
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
  MessageCreateParamsStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { LlmConfig } from "../config.js";
import type {
  AssistantMessage,
  Message,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  StopReason,
  StreamHandlers,
  ToolCall,
} from "./types.js";

/** Models that support fallbacks: "default" (on the Claude API) */
const FALLBACK_MODELS = /^claude-(opus-5|fable-5-1|sonnet-5-5)/;
/**
 * Models that reject a non-default temperature (sampling parameters removed or fixed).
 * On these we leave temperature out; adaptive thinking and effort steer instead.
 */
const NO_SAMPLING = /^claude-(fable|mythos|opus-5|opus-4-[78]|sonnet-5|haiku-5)/;
/** Haiku 4.5 and older models don't support adaptive thinking / effort */
const LEGACY_THINKING = /^claude-(haiku-[34]|3|sonnet-4-5|opus-4-5|opus-4-1|sonnet-4-0|opus-4-0)/;

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;
  private readonly maxOutputTokens: number;
  private readonly effort: LlmConfig["anthropicEffort"];
  private readonly thinking: LlmConfig["anthropicThinking"];

  constructor(cfg: LlmConfig) {
    this.model = cfg.model;
    this.maxOutputTokens = cfg.maxOutputTokens;
    this.effort = cfg.anthropicEffort;
    this.thinking = cfg.anthropicThinking;
    // Without an apiKey the SDK looks for credentials in ANTHROPIC_API_KEY → ANTHROPIC_AUTH_TOKEN → the `ant auth login` profile
    this.client = new Anthropic({
      ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
      ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
    });
  }

  buildRequest(req: ModelRequest): MessageCreateParamsStreaming {
    const tools: BetaTool[] = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as BetaTool.InputSchema,
      eager_input_streaming: true,
    }));
    const legacy = LEGACY_THINKING.test(this.model);
    // Thinking can't be combined with a non-default temperature, so temperature only goes out
    // on the no-thinking (legacy) branch, and never to a model that rejects sampling parameters.
    const temperature = req.temperature !== undefined && legacy && !NO_SAMPLING.test(this.model) ? req.temperature : undefined;
    const fallback = FALLBACK_MODELS.test(this.model);
    return {
      model: this.model,
      max_tokens: this.maxOutputTokens,
      stream: true,
      system: req.system,
      ...(temperature !== undefined ? { temperature } : {}),
      messages: toAnthropicMessages(req.messages, this.model),
      ...(tools.length ? { tools } : {}),
      cache_control: { type: "ephemeral" },
      ...(legacy
        ? {}
        : {
            // A voice call can't wait: ElevenLabs hangs up when the first word takes about 4 s.
            thinking: this.thinking === "off" ? { type: /^claude-sonnet-5-5/.test(this.model) ? "between_tools" : "disabled" } : { type: "adaptive", display: "summarized" },
            output_config: { effort: this.effort },
          }),
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    };
  }

  async stream(req: ModelRequest, handlers: StreamHandlers): Promise<ModelResponse> {
    const stream = this.client.beta.messages.stream(this.buildRequest(req), { signal: req.signal });
    if (handlers.onText) stream.on("text", (delta) => handlers.onText?.(delta));
    if (handlers.onReasoning) stream.on("thinking", (delta) => handlers.onReasoning?.(delta));
    return toModelResponse(await stream.finalMessage(), this.name);
  }
}

function toModelResponse(final: Anthropic.Beta.Messages.BetaMessage, provider: string): ModelResponse {
  let text = "";
  let reasoning = "";
  const toolCalls: ToolCall[] = [];
  for (const block of final.content) {
    if (block.type === "text") text += block.text;
    else if (block.type === "thinking") reasoning += block.thinking;
    else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, args: block.input });
  }
  const u = final.usage;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const message: AssistantMessage = {
    role: "assistant",
    text,
    ...(reasoning ? { reasoning } : {}),
    toolCalls,
    // Record the model that actually served (with fallback it may differ); replay uses it to decide whether thinking blocks can go back
    native: { provider, model: final.model, content: final.content },
  };
  return {
    message,
    stopReason: mapStopReason(final.stop_reason, toolCalls.length > 0),
    usage: {
      inputTokens: u.input_tokens + cacheRead + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens,
      cachedInputTokens: cacheRead,
    },
  };
}

function mapStopReason(reason: string | null, hasToolCalls: boolean): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return hasToolCalls ? "tool_use" : "other";
  }
}

/**
 * Provider-neutral messages → Anthropic messages.
 * Must be deterministic: the same history converts to the same bytes every time, or the prompt cache
 * and preserved thinking both stop working.
 */
export function toAnthropicMessages(messages: Message[], model: string): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];
  // Merge consecutive messages of the same role (several tool_results must share one user message)
  const push = (role: "user" | "assistant", blocks: BetaContentBlockParam[]) => {
    if (!blocks.length) return;
    const last = out.at(-1);
    if (last && last.role === role && Array.isArray(last.content)) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };

  for (const m of messages) {
    switch (m.role) {
      case "user":
        push("user", [
          ...(m.context ? [{ type: "text" as const, text: m.context }] : []),
          { type: "text", text: m.text },
        ]);
        break;
      case "assistant":
        push("assistant", assistantBlocks(m, model));
        break;
      case "tool":
        push("user", [
          { type: "tool_result", tool_use_id: m.toolCallId, content: m.content, ...(m.isError ? { is_error: true } : {}) },
        ]);
        break;
    }
  }
  return out;
}

function assistantBlocks(m: AssistantMessage, model: string): BetaContentBlockParam[] {
  if (m.native?.provider === "anthropic" && m.native.model === model) {
    return m.native.content as BetaContentBlockParam[];
  }
  // History from another provider or another model: keep text and tool calls, drop thinking
  return [
    ...(m.text ? [{ type: "text" as const, text: m.text }] : []),
    ...m.toolCalls.map((tc) => ({
      type: "tool_use" as const,
      id: tc.id,
      name: tc.name,
      input: (tc.args ?? {}) as Record<string, unknown>,
    })),
  ];
}
