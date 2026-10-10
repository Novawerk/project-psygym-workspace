// Copied from Novawerk/agent-starter (MIT), apps/agent/src/llm/types.ts at fcbd91c.
// https://github.com/Novawerk/agent-starter — changes: import paths (.js), Usage inlined (no @app/shared),
// ModelRequest.temperature.
// Provider-neutral message / call shapes. The harness only knows these types; each provider adapter
// converts to and from its native format.
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments; undefined when parsing failed, with the reason in argsError */
  args: unknown;
  argsError?: string;
}

export interface UserMessage {
  role: "user";
  text: string;
  /**
   * Dynamic context injected each turn (working memory, user memory, time…).
   * It lives in the user message, not the system prompt: the history stays append-only, so the prompt
   * cache and Claude's preserved thinking keep working.
   */
  context?: string;
  /** "summary" = the summary message written by context compaction */
  kind?: "summary";
}

export interface AssistantMessage {
  role: "assistant";
  text: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  /**
   * The provider's native assistant content (e.g. Claude's signed thinking blocks).
   * Replayed as-is for the same provider + model; dropped after a model switch, falling back to text/toolCalls.
   */
  native?: { provider: string; model: string; content: unknown };
}

export interface ToolResultMessage {
  role: "tool";
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema (an object schema) */
  parameters: Record<string, unknown>;
}

export interface ModelRequest {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  /** Sampling temperature. Adapters drop it where the model doesn't accept it. */
  temperature?: number;
  signal?: AbortSignal;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface ModelResponse {
  message: AssistantMessage;
  stopReason: StopReason;
  usage: Usage;
}

/** Streaming callbacks; the provider calls them as deltas arrive */
export interface StreamHandlers {
  onText?(delta: string): void;
  onReasoning?(delta: string): void;
}

export interface ModelProvider {
  readonly name: string;
  readonly model: string;
  /**
   * Convert the provider-neutral request into the native request body (the trace records it as
   * "what the LLM actually saw"). Leaves out runtime fields such as signal.
   */
  buildRequest(req: ModelRequest): unknown;
  /** Streaming call; resolves with the complete assistant message */
  stream(req: ModelRequest, handlers: StreamHandlers): Promise<ModelResponse>;
}

export const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
  };
}

/** Join the user message and its injected context into one text (for providers without multiple content blocks) */
export function renderUserText(m: UserMessage): string {
  return m.context ? `${m.context}\n\n${m.text}` : m.text;
}

export function parseToolArgs(raw: string): { args: unknown; argsError?: string } {
  if (!raw.trim()) return { args: {} };
  try {
    return { args: JSON.parse(raw) };
  } catch (err) {
    return { args: undefined, argsError: `Tool arguments are not valid JSON: ${(err as Error).message}. Raw: ${raw.slice(0, 500)}` };
  }
}
