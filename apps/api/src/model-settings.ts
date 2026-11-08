// Model settings in the admin (docs/decisions/0015-model-settings.md).
//
// The admin can choose, per role, the provider and model, and store the API keys. They sit on top
// of the environment: what the admin left empty, the environment decides, as before. Keys are
// encrypted with MODEL_SETTINGS_SECRET (AES-256-GCM) before they reach the database, and never
// leave the server again: the admin sees only the last four characters.
//
// Like the published content (src/content-source.ts), a warm instance never waits for the
// database: past 60 s the settings are loaded again in the background. Only the first request
// waits, at most 1.5 s. A failed load keeps the last settings that loaded.
//
// No database code here: the loader is passed in (src/model-settings-db.ts).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { Logger } from "./app.js";
import { PROVIDER_DEFAULTS, type LlmConfig, type LlmEnv, type ProviderName, type Role, type RoleLlm } from "./config.js";

/** The providers the admin can choose. Anthropic always; DeepSeek only with MODEL_SETTINGS_ALLOW_DEEPSEEK. */
export const SETTABLE = ["anthropic", "deepseek"] as const;
export type SettableProvider = (typeof SETTABLE)[number];
export const ROLES: Role[] = ["client", "supervisor"];

export interface RoleChoice {
  provider: SettableProvider;
  /** Empty: the provider's default model. */
  model: string;
}

/** What the database holds, decrypted. */
export interface StoredSettings {
  roles: Partial<Record<Role, RoleChoice>>;
  keys: Partial<Record<SettableProvider, string>>;
  /** Last four characters of each stored key. */
  hints: Partial<Record<SettableProvider, string>>;
  updatedAt: Date | null;
}

export const EMPTY: StoredSettings = { roles: {}, keys: {}, hints: {}, updatedAt: null };

// ── Encryption ──

const keyOf = (secret: string) => createHash("sha256").update(`psygym-model-settings:${secret}`).digest();

/** "v1.<iv>.<tag>.<ciphertext>", base64url. */
export function encrypt(secret: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Throws when the secret is wrong or the text was changed. */
export function decrypt(secret: string, sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || data === undefined) throw new Error("not a sealed value");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export const hintOf = (key: string) => key.slice(-4);

// ── Keys ──

/** A key's shape, before we spend a call on it. Null: fine; else the reason, in Chinese for the page. */
export function keyProblem(provider: SettableProvider, key: string): string | null {
  if (/\s/.test(key)) return "key 里不能有空格或换行。";
  if (key.length < 20 || key.length > 300) return "key 的长度不对。";
  if (provider === "anthropic" && !key.startsWith("sk-ant-")) return "Claude 的 key 以 sk-ant- 开头。";
  if (provider === "deepseek" && !key.startsWith("sk-")) return "DeepSeek 的 key 以 sk- 开头。";
  return null;
}

// ── Settings on top of the environment ──

function source(role: Role, s: StoredSettings, base: RoleLlm, allowed: (p: SettableProvider) => boolean) {
  const choice = s.roles[role];
  // A choice of a provider that isn't allowed any more (the flag was turned off) is ignored.
  if (choice && allowed(choice.provider)) return choice;
  return base.ok && (SETTABLE as readonly string[]).includes(base.llm.provider) ? null : undefined;
}

/**
 * The model config a role uses now: the environment's, with the admin's choice and keys on top.
 * - The admin chose a provider: that provider, the model chosen (or its default), the admin's key
 *   for it, else the environment's.
 * - No choice: the environment's provider and model, with the admin's key if it has one for it.
 */
export function effectiveLlm(role: Role, base: RoleLlm, env: LlmEnv, s: StoredSettings, allowed: (p: SettableProvider) => boolean): RoleLlm {
  const choice = source(role, s, base, allowed);
  if (choice === undefined) return base; // mock, openai…: the admin doesn't touch them
  if (choice === null) {
    if (!base.ok) return base;
    const key = s.keys[base.llm.provider as SettableProvider];
    return key ? { ok: true, llm: { ...base.llm, apiKey: key } } : base;
  }
  const provider: ProviderName = choice.provider;
  const defaults = PROVIDER_DEFAULTS[provider];
  const same = base.ok && base.llm.provider === provider;
  const apiKey = s.keys[choice.provider] ?? env.keys[provider];
  if (!apiKey) return { ok: false, reason: `no API key for ${provider}` };
  const llm: LlmConfig = {
    provider,
    model: choice.model || defaults.model,
    // A base URL from the environment belongs to the environment's provider.
    baseURL: same ? base.llm.baseURL : defaults.baseURL,
    apiKey,
    maxOutputTokens: env.maxOutputTokens ?? defaults.maxOutputTokens,
    anthropicEffort: (role === "client" ? env.clientEffort : undefined) ?? env.anthropicEffort,
    anthropicThinking: role === "client" ? env.clientThinking : "adaptive",
  };
  return { ok: true, llm };
}

/** What the admin page shows: per role what is used and where it comes from; per provider whose key. */
export interface ModelsView {
  roles: Record<Role, { provider: string | null; model: string | null; from: "admin" | "env"; available: boolean; reason?: string }>;
  keys: Record<SettableProvider, { from: "admin" | "env" | null; hint: string | null }>;
  providers: { id: SettableProvider; allowed: boolean; defaultModel: string }[];
  updatedAt: string | null;
}

export function viewOf(base: Record<Role, RoleLlm>, env: LlmEnv, s: StoredSettings, allowDeepseek: boolean): ModelsView {
  const allowed = (p: SettableProvider) => p === "anthropic" || allowDeepseek;
  const roles = {} as ModelsView["roles"];
  for (const role of ROLES) {
    const eff = effectiveLlm(role, base[role], env, s, allowed);
    const fromAdmin = Boolean(source(role, s, base[role], allowed));
    roles[role] = eff.ok
      ? { provider: eff.llm.provider, model: eff.llm.model, from: fromAdmin ? "admin" : "env", available: true }
      : { provider: s.roles[role]?.provider ?? null, model: s.roles[role]?.model ?? null, from: fromAdmin ? "admin" : "env", available: false, reason: eff.reason };
  }
  const keys = {} as ModelsView["keys"];
  for (const p of SETTABLE) {
    const envKey = env.keys[p];
    keys[p] = s.keys[p] ? { from: "admin", hint: s.hints[p] ?? hintOf(s.keys[p]!) } : envKey ? { from: "env", hint: hintOf(envKey) } : { from: null, hint: null };
  }
  return {
    roles,
    keys,
    providers: SETTABLE.map((id) => ({ id, allowed: allowed(id), defaultModel: PROVIDER_DEFAULTS[id].model })),
    updatedAt: s.updatedAt?.toISOString() ?? null,
  };
}

// ── The cached copy ──

export const SETTINGS_TTL_MS = 60_000;
export const SETTINGS_FIRST_WAIT_MS = 1500;

export interface SettingsSource {
  /** Before a model call: the settings to use (loads in the background when stale). */
  current(): Promise<StoredSettings>;
  /** The last copy, without waiting. */
  latest(): StoredSettings;
  /** After a save on this instance: load again now. */
  refresh(): Promise<void>;
}

export function cachedSettings(o: {
  load: () => Promise<StoredSettings>;
  logger: Logger;
  now?: () => number;
  keepAlive?: (p: Promise<unknown>) => void;
  ttlMs?: number;
  firstWaitMs?: number;
}): SettingsSource {
  const now = o.now ?? Date.now;
  const ttl = o.ttlMs ?? SETTINGS_TTL_MS;
  let loaded: StoredSettings = EMPTY;
  let attemptedAt: number | null = null;
  let inflight: Promise<void> | null = null;

  function load(): Promise<void> {
    if (inflight) return inflight;
    attemptedAt = now();
    inflight = o
      .load()
      .then((s) => {
        loaded = s;
      })
      .catch((err) => {
        o.logger.error({ msg: "model settings: load failed", error: (err as Error)?.constructor?.name ?? typeof err });
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  return {
    async current() {
      if (attemptedAt === null) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const p = load();
        o.keepAlive?.(p);
        await Promise.race([p, new Promise<void>((r) => (timer = setTimeout(r, o.firstWaitMs ?? SETTINGS_FIRST_WAIT_MS)))]);
        clearTimeout(timer);
        return loaded;
      }
      if (!inflight && now() - attemptedAt >= ttl) {
        const p = load();
        o.keepAlive?.(p);
      }
      return loaded;
    },
    latest: () => loaded,
    refresh: async () => {
      if (inflight) await inflight;
      await load();
    },
  };
}

/** A stable fingerprint of a config, for the provider cache (the key itself only hashed). */
export function fingerprint(c: LlmConfig): string {
  const key = c.apiKey ? createHash("sha256").update(c.apiKey).digest("hex").slice(0, 16) : "";
  return JSON.stringify([c.provider, c.model, c.baseURL ?? "", key, c.maxOutputTokens, c.anthropicEffort, c.anthropicThinking ?? ""]);
}
