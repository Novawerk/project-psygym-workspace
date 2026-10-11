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
  /**
   * Comma-separated, each `code` or `code:batch`. When set, requests without a session need a
   * matching X-Invite-Code. Codes of 12+ characters also let a new account sign up (ADR 0008).
   */
  INVITE_CODES: optionalString,
  /** Streaming requests allowed per key (invite code, else IP) per window. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(60),

  // ── Anonymous counts (docs/decisions/0007-anonymous-counts.md) ──
  /** "true" turns counting on; it still stays off without DATABASE_URL. */
  METRICS_ENABLED: z.enum(["true", "false", "1", "0"]).optional(),
  /** Postgres (Neon, Frankfurt). Pooled URL at runtime. */
  DATABASE_URL: optionalString,
  /** Bearer token for GET /admin/stats. Unset: the endpoint answers 404. */
  ADMIN_STATS_TOKEN: optionalString,

  // ── Sign-in (docs/decisions/0008-sign-in.md) ──
  /** "on" turns sign-in on (needs DATABASE_URL and AUTH_SECRET). Default off: nothing changes. */
  AUTH_MODE: z.enum(["off", "on"]).default("off"),
  /** From this UTC date-time on, a request needs a session token ("required"). Unset: "optional". */
  AUTH_REQUIRED_FROM: optionalString.pipe(z.iso.datetime({ offset: true }).optional()),
  /** Key for code MACs, rate-counter keys. At least 32 characters. */
  AUTH_SECRET: optionalString.pipe(z.string().min(32).optional()),
  /** Key for the pseudonymous active-account records. At least 32 characters. Unset: none. */
  METRICS_ID_SECRET: optionalString.pipe(z.string().min(32).optional()),
  /** Resend, for the code email. Unset: no email goes out (a log line says so). */
  RESEND_API_KEY: optionalString,
  AUTH_EMAIL_FROM: z.string().default("聆镜 PSYGYM <no-reply@novawerk.io>"),
  /** The store reviewer: one address, one fixed 6-digit code. Clear both after review. */
  REVIEW_LOGIN_EMAIL: optionalString.pipe(z.email().optional()),
  REVIEW_LOGIN_CODE: optionalString.pipe(z.string().regex(/^\d{6}$/).optional()),
  /** Bearer token for POST /admin/accounts/delete. Unset: the endpoint answers 404. */
  ADMIN_TOKEN: optionalString,

  // ── Report feedback ──
  /** Slack incoming webhook for POST /feedback. Unset: feedback is dropped (204). */
  FEEDBACK_SLACK_WEBHOOK_URL: optionalString.pipe(z.url({ protocol: /^https$/ }).optional()),
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

/** Codes of at least this length may create accounts (about 60 bits with a 31-letter alphabet). */
export const SIGNUP_CODE_MIN = 12;

export interface AuthConfig {
  databaseUrl: string;
  secret: string;
  /** UTC ms; null: "optional" for as long as AUTH_MODE is on. */
  requiredFrom: number | null;
  idSecret: string | null;
  resendKey: string | null;
  emailFrom: string;
  review: { email: string; code: string } | null;
  adminToken: string | null;
  /** Invite code → batch name, for codes long enough to sign up. */
  signupInvites: Map<string, string>;
}

export interface AppConfig {
  llm: Record<Role, RoleLlm>;
  /** Variables we ignored because their value was invalid. Names only, never values. */
  errors: string[];
  inviteCodes: Set<string> | null;
  rateLimit: { max: number; windowMs: number };
  /** Where POST /feedback goes. Null: dropped. */
  feedbackWebhookUrl: string | null;
  /** Counting is on only with METRICS_ENABLED=true and a DATABASE_URL. */
  metrics: { databaseUrl: string } | null;
  /** Sign-in; null when AUTH_MODE is off or what it needs is missing. */
  auth: AuthConfig | null;
  adminStatsToken: string | null;
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
  // "code" or "code:batch". The code alone is what X-Invite-Code carries.
  const entries = (e.INVITE_CODES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [code, batch] = s.split(":").map((x) => x.trim());
      return { code: code!, batch: batch || "default" };
    })
    .filter((x) => x.code);
  const codes = entries.map((x) => x.code);
  const errors = [...invalid].sort().map((k) => `${k} has an invalid value and is ignored`);

  let auth: AuthConfig | null = null;
  if (e.AUTH_MODE === "on") {
    if (!e.DATABASE_URL || !e.AUTH_SECRET) {
      errors.push("AUTH_MODE is on but DATABASE_URL or AUTH_SECRET (32+ characters) is missing; sign-in stays off");
    } else {
      const short = entries.filter((x) => x.code.length < SIGNUP_CODE_MIN).length;
      if (short) errors.push(`INVITE_CODES: ${short} code(s) shorter than ${SIGNUP_CODE_MIN} characters work as X-Invite-Code only, not for sign-up`);
      if (Boolean(e.REVIEW_LOGIN_EMAIL) !== Boolean(e.REVIEW_LOGIN_CODE)) errors.push("REVIEW_LOGIN_EMAIL and REVIEW_LOGIN_CODE go together; the reviewer sign-in is off");
      auth = {
        databaseUrl: e.DATABASE_URL,
        secret: e.AUTH_SECRET,
        requiredFrom: e.AUTH_REQUIRED_FROM ? Date.parse(e.AUTH_REQUIRED_FROM) : null,
        idSecret: e.METRICS_ID_SECRET ?? null,
        resendKey: e.RESEND_API_KEY ?? null,
        emailFrom: e.AUTH_EMAIL_FROM,
        review: e.REVIEW_LOGIN_EMAIL && e.REVIEW_LOGIN_CODE ? { email: e.REVIEW_LOGIN_EMAIL.trim().toLowerCase(), code: e.REVIEW_LOGIN_CODE } : null,
        adminToken: e.ADMIN_TOKEN ?? null,
        signupInvites: new Map(entries.filter((x) => x.code.length >= SIGNUP_CODE_MIN).map((x) => [x.code, x.batch])),
      };
    }
  }
  return {
    llm: { client: roleLlm("client", e, invalid), supervisor: roleLlm("supervisor", e, invalid) },
    errors,
    inviteCodes: codes.length ? new Set(codes) : null,
    rateLimit: { max: e.RATE_LIMIT_MAX, windowMs: e.RATE_LIMIT_WINDOW_SEC * 1000 },
    feedbackWebhookUrl: e.FEEDBACK_SLACK_WEBHOOK_URL ?? null,
    metrics: (e.METRICS_ENABLED === "true" || e.METRICS_ENABLED === "1") && e.DATABASE_URL ? { databaseUrl: e.DATABASE_URL } : null,
    adminStatsToken: e.ADMIN_STATS_TOKEN ?? null,
    auth,
  };
}
