// Environment → config. The LLM_* part follows Novawerk/agent-starter (MIT),
// apps/agent/src/config.ts at fcbd91c (https://github.com/Novawerk/agent-starter).
// What we add: the AI client and the AI supervisor can each use their own provider
// (CLIENT_LLM_* / SUPERVISOR_LLM_*), and a missing key makes that role "unavailable"
// instead of crashing the server.
import { z } from "zod";

const ProviderEnum = z.enum(["anthropic", "deepseek", "mock", "openai", "openai-compatible"]);
export type ProviderName = z.infer<typeof ProviderEnum>;
export type Role = "client" | "supervisor";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));
const optionalProvider = optionalString.pipe(ProviderEnum.optional());

const EnvSchema = z.object({
  // ── LLM (shared) ──
  LLM_PROVIDER: optionalProvider,
  LLM_MODEL: optionalString,
  LLM_BASE_URL: optionalString,
  LLM_API_KEY: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  /** Anthropic only: low | medium | high | xhigh | max */
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),

  // ── Per-role overrides ──
  CLIENT_LLM_PROVIDER: optionalProvider,
  CLIENT_LLM_MODEL: optionalString,
  CLIENT_LLM_BASE_URL: optionalString,
  SUPERVISOR_LLM_PROVIDER: optionalProvider,
  SUPERVISOR_LLM_MODEL: optionalString,
  SUPERVISOR_LLM_BASE_URL: optionalString,

  // ── Access ──
  /** Comma-separated. When set, every request but /health needs a matching X-Invite-Code. */
  INVITE_CODES: optionalString,
  /** Streaming requests allowed per key (invite code, else IP) per window. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(60),
});

export interface LlmConfig {
  provider: ProviderName;
  model: string;
  baseURL: string | undefined;
  apiKey: string | undefined;
  maxOutputTokens: number;
  anthropicEffort: "low" | "medium" | "high" | "xhigh" | "max";
}

/** A role either has a usable model config, or a reason why not (→ 503 model_unavailable). */
export type RoleLlm = { ok: true; llm: LlmConfig } | { ok: false; reason: string };

export interface AppConfig {
  llm: Record<Role, RoleLlm>;
  /** Variables we ignored because their value was invalid. Names only, never values. */
  errors: string[];
  inviteCodes: Set<string> | null;
  rateLimit: { max: number; windowMs: number };
}

const PROVIDER_DEFAULTS: Record<ProviderName, { model: string; baseURL?: string; maxOutputTokens: number }> = {
  deepseek: { model: "deepseek-chat", baseURL: "https://api.deepseek.com", maxOutputTokens: 8192 },
  openai: { model: "", maxOutputTokens: 16_000 },
  "openai-compatible": { model: "", maxOutputTokens: 8192 },
  // Latest Sonnet: fast enough to stream a role-play reply, strong enough to supervise.
  anthropic: { model: "claude-sonnet-5-5", maxOutputTokens: 16_000 },
  mock: { model: "mock", maxOutputTokens: 4096 },
};

type Env = z.infer<typeof EnvSchema>;

function keyFor(provider: ProviderName, e: Env): string | undefined {
  switch (provider) {
    case "deepseek":
      return e.DEEPSEEK_API_KEY ?? e.LLM_API_KEY;
    case "anthropic":
      return e.ANTHROPIC_API_KEY ?? e.LLM_API_KEY;
    case "openai":
      return e.OPENAI_API_KEY ?? e.LLM_API_KEY;
    case "openai-compatible":
      return e.LLM_API_KEY;
    case "mock":
      return undefined;
  }
}

function roleLlm(role: Role, e: Env, invalid: Set<string>): RoleLlm {
  const prefix = role === "client" ? "CLIENT" : "SUPERVISOR";
  // A misspelt provider makes the role unavailable; it never falls back to another provider.
  if (invalid.has(`${prefix}_LLM_PROVIDER`)) return { ok: false, reason: `${prefix}_LLM_PROVIDER is not a known provider` };
  const override = role === "client" ? e.CLIENT_LLM_PROVIDER : e.SUPERVISOR_LLM_PROVIDER;
  if (!override && invalid.has("LLM_PROVIDER")) return { ok: false, reason: "LLM_PROVIDER is not a known provider" };
  const provider = override ?? e.LLM_PROVIDER;
  if (!provider) return { ok: false, reason: `no provider: set LLM_PROVIDER or ${prefix}_LLM_PROVIDER` };

  // LLM_MODEL / LLM_BASE_URL belong to LLM_PROVIDER; a role on another provider uses its own defaults.
  const sharedApplies = provider === e.LLM_PROVIDER;
  const defaults = PROVIDER_DEFAULTS[provider];
  const roleModel = role === "client" ? e.CLIENT_LLM_MODEL : e.SUPERVISOR_LLM_MODEL;
  const roleBase = role === "client" ? e.CLIENT_LLM_BASE_URL : e.SUPERVISOR_LLM_BASE_URL;
  const model = roleModel ?? (sharedApplies ? e.LLM_MODEL : undefined) ?? defaults.model;
  if (!model) return { ok: false, reason: `${prefix}_LLM_MODEL (or LLM_MODEL) is required for ${provider}` };

  const apiKey = keyFor(provider, e);
  if (provider !== "mock" && !apiKey) return { ok: false, reason: `no API key for ${provider}` };

  return {
    ok: true,
    llm: {
      provider,
      model,
      baseURL: roleBase ?? (sharedApplies ? e.LLM_BASE_URL : undefined) ?? defaults.baseURL,
      apiKey,
      maxOutputTokens: e.LLM_MAX_OUTPUT_TOKENS ?? defaults.maxOutputTokens,
      anthropicEffort: e.ANTHROPIC_EFFORT,
    },
  };
}

/**
 * Never throws: a bad value must not take /health down with it. Invalid variables are dropped
 * (so they fall back to their default, or make their role unavailable) and listed in `errors`.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  // Blank lines in .env (`FOO=`) mean "not set".
  const set: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v.trim() !== "") set[k] = v;

  const invalid = new Set<string>();
  let parsed = EnvSchema.safeParse(set);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") {
        invalid.add(key);
        delete set[key];
      }
    }
    parsed = EnvSchema.safeParse(set);
  }
  // Only keys from the schema can fail, and each one is optional or has a default.
  if (!parsed.success) throw new Error("unreachable: env still invalid after dropping bad keys");
  const e = parsed.data;
  const codes = (e.INVITE_CODES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    llm: { client: roleLlm("client", e, invalid), supervisor: roleLlm("supervisor", e, invalid) },
    errors: [...invalid].sort().map((k) => `${k} has an invalid value and is ignored`),
    inviteCodes: codes.length ? new Set(codes) : null,
    rateLimit: { max: e.RATE_LIMIT_MAX, windowMs: e.RATE_LIMIT_WINDOW_SEC * 1000 },
  };
}
