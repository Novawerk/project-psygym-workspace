// Model settings in the admin (docs/decisions/0015-model-settings.md): the pure part, and the
// routes against PGlite with the real migrations. The model check and the model itself are faked.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE, addAdmin, createAdmin } from "../src/admin/index.js";
import { modelSettings, modelSettingsLog } from "../src/admin/schema.js";
import { createApp, type Logger } from "../src/app.js";
import { loadConfig, type RoleLlm } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import type { MetricsDb } from "../src/metrics/store.js";
import { loadSettings } from "../src/model-settings-db.js";
import { EMPTY, cachedSettings, decrypt, effectiveLlm, encrypt, keyProblem, type StoredSettings } from "../src/model-settings.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://admin.psygym.example";
const SECRET = "s".repeat(40);
const ENV_KEY = "sk-ant-env-0000000000000000000000-ENV1";
const NEW_KEY = "sk-ant-new-1111111111111111111111-NEW9";
const DS_KEY = "sk-deepseek-22222222222222222222-DSK7";

afterEach(() => vi.unstubAllGlobals());

describe("encryption", () => {
  it("round-trips, and a wrong secret or a changed text throws", () => {
    const sealed = encrypt(SECRET, NEW_KEY);
    expect(sealed).not.toContain(NEW_KEY);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decrypt(SECRET, sealed)).toBe(NEW_KEY);
    expect(encrypt(SECRET, NEW_KEY)).not.toBe(sealed); // fresh IV
    expect(() => decrypt("t".repeat(40), sealed)).toThrow();
    const parts = sealed.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("AA") ? "BB" : "AA");
    expect(() => decrypt(SECRET, parts.join("."))).toThrow();
  });

  it("checks a key's shape before any call", () => {
    expect(keyProblem("anthropic", NEW_KEY)).toBeNull();
    expect(keyProblem("anthropic", DS_KEY)).toContain("sk-ant-");
    expect(keyProblem("anthropic", "sk-ant- with space 000000000")).toContain("空格");
    expect(keyProblem("deepseek", DS_KEY)).toBeNull();
    expect(keyProblem("deepseek", "short")).toContain("长度");
  });
});

describe("settings on top of the environment", () => {
  const config = loadConfig({ CLIENT_LLM_PROVIDER: "anthropic", SUPERVISOR_LLM_PROVIDER: "anthropic", LLM_PROVIDER: "deepseek", ANTHROPIC_API_KEY: ENV_KEY, CLIENT_LLM_THINKING: "off" });
  const all = () => true;
  const onlyClaude = (p: string) => p === "anthropic";
  const llm = (r: RoleLlm) => (r.ok ? r.llm : null);

  it("nothing stored: exactly the environment's config", () => {
    expect(effectiveLlm("client", config.llm.client, config.llmEnv, EMPTY, all)).toBe(config.llm.client);
  });

  it("a stored key only: the environment's provider and model, with that key", () => {
    const s: StoredSettings = { ...EMPTY, keys: { anthropic: NEW_KEY } };
    const r = llm(effectiveLlm("client", config.llm.client, config.llmEnv, s, all))!;
    expect(r).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5", apiKey: NEW_KEY, anthropicThinking: "off" });
  });

  it("a chosen provider and model; empty model means its default; no key means unavailable", () => {
    const s: StoredSettings = { ...EMPTY, roles: { supervisor: { provider: "anthropic", model: "claude-opus-5" }, client: { provider: "deepseek", model: "" } } };
    expect(llm(effectiveLlm("supervisor", config.llm.supervisor, config.llmEnv, s, all))).toMatchObject({ model: "claude-opus-5", apiKey: ENV_KEY, anthropicThinking: "adaptive" });
    expect(effectiveLlm("client", config.llm.client, config.llmEnv, s, all)).toEqual({ ok: false, reason: "no API key for deepseek" });
    const withKey = { ...s, keys: { deepseek: DS_KEY } };
    expect(llm(effectiveLlm("client", config.llm.client, config.llmEnv, withKey, all))).toMatchObject({ provider: "deepseek", model: "deepseek-chat", baseURL: "https://api.deepseek.com", apiKey: DS_KEY });
  });

  it("a stored DeepSeek choice is ignored once DeepSeek isn't allowed", () => {
    const s: StoredSettings = { ...EMPTY, roles: { client: { provider: "deepseek", model: "" } }, keys: { deepseek: DS_KEY } };
    expect(effectiveLlm("client", config.llm.client, config.llmEnv, s, onlyClaude)).toBe(config.llm.client);
  });

  it("a role on mock (tests, local) is never touched", () => {
    const mock = loadConfig({ LLM_PROVIDER: "mock" });
    const s: StoredSettings = { ...EMPTY, keys: { anthropic: NEW_KEY } };
    expect(effectiveLlm("client", mock.llm.client, mock.llmEnv, s, all)).toBe(mock.llm.client);
  });

  it("config: the secret needs the admin, and must be long enough", () => {
    expect(loadConfig({ MODEL_SETTINGS_SECRET: SECRET }).errors.join()).toContain("admin is off");
    const admin = { ADMIN_MODE: "on", DATABASE_URL: "postgres://x", ADMIN_GOOGLE_CLIENT_ID: "id", ADMIN_ORIGIN: ORIGIN };
    expect(loadConfig({ ...admin, MODEL_SETTINGS_SECRET: SECRET }).modelSettings).toEqual({ databaseUrl: "postgres://x", secret: SECRET, allowDeepseek: false });
    expect(loadConfig({ ...admin, MODEL_SETTINGS_SECRET: SECRET, MODEL_SETTINGS_ALLOW_DEEPSEEK: "true" }).modelSettings?.allowDeepseek).toBe(true);
    const short = loadConfig({ ...admin, MODEL_SETTINGS_SECRET: "short" });
    expect(short.modelSettings).toBeNull();
    expect(short.errors.join()).toContain("MODEL_SETTINGS_SECRET");
  });
});

describe("the cached copy", () => {
  it("first request waits; later ones use the copy and reload in the background past the TTL", async () => {
    let now = 0;
    let loads = 0;
    const s = cachedSettings({
      load: async () => ({ ...EMPTY, keys: { anthropic: `k${++loads}` } }),
      logger: { info() {}, error() {} },
      now: () => now,
    });
    expect((await s.current()).keys.anthropic).toBe("k1");
    now += 30_000;
    expect((await s.current()).keys.anthropic).toBe("k1");
    now += 31_000;
    await s.current();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.latest().keys.anthropic).toBe("k2");
    await s.refresh();
    expect(s.latest().keys.anthropic).toBe("k3");
  });
});

async function setup(env: Record<string, string> = {}) {
  const client = new PGlite();
  const db = drizzle(client) as unknown as MetricsDb;
  await migrate(drizzle(client), { migrationsFolder: path.join(here, "../drizzle") });
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const config = loadConfig({
    LLM_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: ENV_KEY,
    ADMIN_MODE: "on",
    DATABASE_URL: "postgres://unused",
    ADMIN_GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
    ADMIN_ORIGIN: ORIGIN,
    MODEL_SETTINGS_SECRET: SECRET,
    ...env,
  });
  const checks: { provider: string; model: string; key: string }[] = [];
  let checkAnswer: string | null = null;
  const settings = config.modelSettings ? cachedSettings({ load: () => loadSettings(db, SECRET, logger), logger }) : null;
  const app = createApp({
    config,
    cases: loadCases(),
    prompts: loadPrompts(),
    logger,
    modelSettings: settings,
    admin: async (hooks) =>
      createAdmin({
        ...hooks,
        config: config.admin!,
        db,
        logger,
        verifyGoogle: async (t) => ({ email: t, sub: `sub-${t}` }),
        modelSettings: config.modelSettings,
        checkModel: async (o) => {
          checks.push({ provider: o.provider, model: o.model, key: o.key });
          return checkAnswer;
        },
      }),
  });
  await addAdmin(db, { email: "boss@example.com", role: "admin", org: "lingjing" });
  await addAdmin(db, { email: "ed@example.com", role: "editor", org: "lingjing" });
  const signIn = async (email: string) => {
    const res = await app.request("/admin/auth/google", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ idToken: email }) });
    return `${SESSION_COOKIE}=${res.headers.get("set-cookie")!.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))![1]}`;
  };
  const call = (cookie: string, method: string, body?: unknown) =>
    app.request("/admin/model-settings", {
      method,
      headers: { cookie, ...(method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" }) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  return { app, db, lines, checks, call, signIn, setCheck: (a: string | null) => (checkAnswer = a) };
}

describe("admin: model settings", () => {
  it("role admin only", async () => {
    const t = await setup();
    const ed = await t.signIn("ed@example.com");
    expect((await t.call(ed, "GET")).status).toBe(403);
    expect((await t.call(ed, "PUT", { keys: { anthropic: NEW_KEY } })).status).toBe(403);
    expect((await t.app.request("/admin/model-settings")).status).toBe(401);
  });

  it("without MODEL_SETTINGS_SECRET: the page says off; saving is a 404", async () => {
    const t = await setup({ MODEL_SETTINGS_SECRET: "" });
    const boss = await t.signIn("boss@example.com");
    expect(await (await t.call(boss, "GET")).json()).toEqual({ enabled: false });
    expect((await t.call(boss, "PUT", { keys: { anthropic: NEW_KEY } })).status).toBe(404);
  });

  it("shows the environment's setup, with only the key's last four characters", async () => {
    const t = await setup();
    const boss = await t.signIn("boss@example.com");
    const page = await (await t.call(boss, "GET")).json();
    expect(page).toMatchObject({
      enabled: true,
      roles: { client: { provider: "anthropic", model: "claude-sonnet-5-5", from: "env", available: true }, supervisor: { from: "env" } },
      keys: { anthropic: { from: "env", hint: "ENV1" }, deepseek: { from: null, hint: null } },
      providers: [
        { id: "anthropic", allowed: true, defaultModel: "claude-sonnet-5-5" },
        { id: "deepseek", allowed: false, defaultModel: "deepseek-chat" },
      ],
      log: [],
    });
    expect(JSON.stringify(page)).not.toContain(ENV_KEY);
  });

  it("a new Claude key: checked, stored sealed, used by the next model call, never logged", async () => {
    const t = await setup();
    const boss = await t.signIn("boss@example.com");
    const res = await t.call(boss, "PUT", { keys: { anthropic: NEW_KEY } });
    expect(res.status).toBe(200);
    const page = await res.json();
    expect(page.keys.anthropic).toEqual({ from: "admin", hint: "NEW9" });
    expect(page.log).toEqual([{ at: expect.any(String), by: "boss@example.com", change: "Claude key 换成 …NEW9" }]);
    // One check per distinct model config: both roles share it.
    expect(t.checks).toEqual([{ provider: "anthropic", model: "claude-sonnet-5-5", key: NEW_KEY }]);

    const [row] = await t.db.select().from(modelSettings);
    expect(row!.anthropicKey).not.toContain(NEW_KEY);
    expect(decrypt(SECRET, row!.anthropicKey!)).toBe(NEW_KEY);
    expect(JSON.stringify(await t.db.select().from(modelSettingsLog))).not.toContain(NEW_KEY);
    expect(JSON.stringify(t.lines)).not.toContain(NEW_KEY);
    expect(JSON.stringify(page)).not.toContain(NEW_KEY);

    // The next /chat goes to Anthropic with the new key.
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      seen.push(headers.get("x-api-key") ?? "");
      return new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "no" } }), { status: 401, headers: { "content-type": "application/json" } });
    });
    const chat = await t.app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId: [...loadCases().keys()][0], locale: "zh", messages: [{ role: "counselor", text: "你好" }] }),
    });
    await chat.text();
    expect(seen).toContain(NEW_KEY);
    expect(seen).not.toContain(ENV_KEY);
  });

  it("a key that fails the check is not saved, and says why", async () => {
    const t = await setup();
    const boss = await t.signIn("boss@example.com");
    t.setCheck("key 不对，或者已经作废了。");
    const res = await t.call(boss, "PUT", { keys: { anthropic: NEW_KEY } });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ field: "keys.anthropic", error: { message: "key 不对，或者已经作废了。" } });
    expect(await t.db.select().from(modelSettings)).toEqual([]);
    expect((await t.call(boss, "PUT", { keys: { anthropic: "not-a-claude-key-000000000" } })).status).toBe(422);
    expect(t.checks).toHaveLength(1); // the bad shape never reached the check
  });

  it("choosing a model per role; DeepSeek refused unless allowed; back to the environment", async () => {
    const t = await setup();
    const boss = await t.signIn("boss@example.com");
    const opus = await (await t.call(boss, "PUT", { supervisor: { provider: "anthropic", model: "claude-opus-5" } })).json();
    expect(opus.roles.supervisor).toMatchObject({ provider: "anthropic", model: "claude-opus-5", from: "admin" });
    expect(opus.roles.client).toMatchObject({ model: "claude-sonnet-5-5", from: "env" });
    expect(t.checks).toEqual([{ provider: "anthropic", model: "claude-opus-5", key: ENV_KEY }]);

    const ds = await t.call(boss, "PUT", { client: { provider: "deepseek", model: "" }, keys: { deepseek: DS_KEY } });
    expect(ds.status).toBe(422);
    expect((await ds.json()).error.message).toContain("隐私政策");

    const back = await (await t.call(boss, "PUT", { supervisor: null })).json();
    expect(back.roles.supervisor).toMatchObject({ model: "claude-sonnet-5-5", from: "env" });
    expect(back.log.map((l: { change: string }) => l.change)).toEqual(["AI 督导改回默认", "AI 督导：Claude claude-opus-5"]);
    expect((await t.call(boss, "PUT", { supervisor: { provider: "anthropic", model: "claude sonnet" } })).status).toBe(400);
  });

  it("with DeepSeek allowed: a role on DeepSeek needs a key, which is checked", async () => {
    const t = await setup({ MODEL_SETTINGS_ALLOW_DEEPSEEK: "true" });
    const boss = await t.signIn("boss@example.com");
    const noKey = await t.call(boss, "PUT", { client: { provider: "deepseek", model: "" } });
    expect(noKey.status).toBe(422);
    expect((await noKey.json()).error.message).toContain("还没有这家的 key");
    const ok = await (await t.call(boss, "PUT", { client: { provider: "deepseek", model: "" }, keys: { deepseek: DS_KEY } })).json();
    expect(ok.roles.client).toMatchObject({ provider: "deepseek", model: "deepseek-chat", from: "admin", available: true });
    expect(t.checks).toEqual([{ provider: "deepseek", model: "deepseek-chat", key: DS_KEY }]);
  });

  it("a stored key that no longer decrypts is ignored: the environment's key is used", async () => {
    const t = await setup();
    const boss = await t.signIn("boss@example.com");
    await t.call(boss, "PUT", { keys: { anthropic: NEW_KEY } });
    const lines: Record<string, unknown>[] = [];
    const s = await loadSettings(t.db, "x".repeat(40), { info() {}, error: (l) => lines.push(l) });
    expect(s.keys).toEqual({});
    expect(lines[0]).toMatchObject({ provider: "anthropic" });
  });
});
