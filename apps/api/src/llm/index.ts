// Copied from Novawerk/agent-starter (MIT), apps/agent/src/llm/index.ts at fcbd91c.
// https://github.com/Novawerk/agent-starter — changes: import paths (.js), LlmConfig comes from ../config.js.
import type { LlmConfig } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { MockProvider } from "./mock.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { ModelProvider } from "./types.js";

export function createProvider(cfg: LlmConfig): ModelProvider {
  switch (cfg.provider) {
    case "anthropic":
      return new AnthropicProvider(cfg);
    case "mock":
      return new MockProvider();
    case "deepseek":
    case "openai":
    case "openai-compatible":
      return new OpenAICompatibleProvider(cfg);
  }
}

export type { ModelProvider } from "./types.js";
