// The admin (docs/admin-api.md), against PGlite with the real migrations. Google is faked.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

import { LIMITS, SESSION_COOKIE, addAdmin, createAdmin, disableAdmin, importContent } from "../src/admin/index.js";
import { admins, contentVersions } from "../src/admin/schema.js";
import { createApp, type Logger } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { contentDir, loadCases, loadPrompts } from "../src/content.js";
import { loadPublished } from "../src/content-db.js";
import { readContentFiles } from "../src/content-files.js";
import { cachedContent } from "../src/content-source.js";
import { MockProvider } from "../src/llm/mock.js";
import { dailyCounts } from "../src/metrics/schema.js";
import { DrizzleMetricsStore, type MetricsDb } from "../src/metrics/store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://admin.psygym.example";
const T0 = Date.UTC(2026, 9, 15, 9, 0);
const CASE = "cbt-depression-anxiety-01";
const PLACEHOLDER = "placeholder-cbt-depression";

/** Fake Google: the token is "<email>|<sub>"; "bad" fails. */
const verifyGoogle = async (t: string) => {
  if (t === "bad") throw new Error("bad token");
  const [email, sub] = t.split("|");
  return { email: email!, sub: sub ?? `sub-${email}` };
};

async function setup(opts: { env?: Record<string, string>; imported?: boolean } = {}) {
  const client = new PGlite();
  const db = drizzle(client) as unknown as MetricsDb;
  await migrate(drizzle(client), { migrationsFolder: path.join(here, "../drizzle") });
  let now = T0;
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const slack: string[] = [];
  const pending: Promise<unknown>[] = [];
  const config = loadConfig({
    LLM_PROVIDER: "mock",
    ADMIN_MODE: "on",
    DATABASE_URL: "postgres://unused",
    ADMIN_GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
    ADMIN_ORIGIN: ORIGIN,
    ...opts.env,
  });
  const cases = loadCases();
  const prompts = loadPrompts();
  const content = cachedContent({
    bundle: { cases, rubrics: prompts.rubrics, versions: new Map() },
    load: () => loadPublished(db),
    logger,
    now: () => now,
    keepAlive: (p) => pending.push(p),
  });
  const mock = new MockProvider();
  const app = createApp({
    config,
    cases,
    prompts,
    logger,
    now: () => now,
    providerFor: () => mock,
    content,
    admin: config.admin
      ? async (hooks) =>
          createAdmin({
            ...hooks,
            config: config.admin!,
            db,
            logger,
            now: () => now,
            verifyGoogle,
            webhookUrl: "https://hooks.slack.com/services/T/B/X",
            fetch: async (_url, init) => {
              slack.push(JSON.parse(String(init.body)).text);
              return new Response("ok");
            },
            keepAlive: (p) => pending.push(p),
          })
      : null,
  });
  if (opts.imported !== false) await importContent(db, readContentFiles(contentDir()), new Date(T0));
  await addAdmin(db, { email: "ed@example.com", role: "editor", org: "lingjing" });
  await addAdmin(db, { email: "vi@example.com", role: "viewer", org: "novawerk" });
  await addAdmin(db, { email: "boss@example.com", role: "admin", org: "novawerk" });

  const settle = async () => {
    while (pending.length) await Promise.all(pending.splice(0));
  };
  const signIn = async (email: string, sub?: string) => {
    const res = await app.request("/admin/auth/google", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ idToken: sub ? `${email}|${sub}` : email }),
    });
    const cookie = res.headers.get("set-cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
    return { res, cookie: cookie ? `${SESSION_COOKIE}=${cookie}` : "" };
  };
  /** A request as the admin page sends it. */
  const call = (cookie: string, method: string, url: string, body?: unknown) =>
    app.request(url, {
      method,
      headers: { cookie, ...(method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" }) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  /** The current draft's revision of an item (the page sends it back). */
  const revisionOf = async (cookie: string, kind: string, id: string): Promise<number> => (await (await call(cookie, "GET", `/admin/content/${kind}/${id}`)).json()).draft.revision;
  return { app, db, lines, slack, settle, signIn, call, revisionOf, content, mock, tick: (ms: number) => (now += ms) };
}

describe("admin off", () => {
  it("its routes don't exist; /admin/stats is as before", async () => {
    const app = createApp({ config: loadConfig({ LLM_PROVIDER: "mock" }), cases: loadCases(), prompts: loadPrompts(), logger: { info() {}, error() {} } });
    for (const p of ["/admin/me", "/admin/content", "/admin/dashboard"]) expect((await app.request(p)).status).toBe(404);
    expect((await app.request("/admin/auth/google", { method: "POST" })).status).toBe(404);
    expect((await app.request("/admin/stats")).status).toBe(404); // no ADMIN_STATS_TOKEN, as before
  });

  it("ADMIN_MODE=on with a variable missing stays off, with a config error", () => {
    const config = loadConfig({ ADMIN_MODE: "on", DATABASE_URL: "postgres://x", ADMIN_ORIGIN: ORIGIN });
    expect(config.admin).toBeNull();
    expect(config.errors.join()).toMatch(/ADMIN_MODE is on/);
  });
});

describe("sign-in", () => {
  it("an enabled admin gets a __Host- cookie; /admin/me answers", async () => {
    const t = await setup();
    const { res, cookie } = await t.signIn("ed@example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "ed@example.com", role: "editor", org: "lingjing" });
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/^__Host-psygym_admin=/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Secure/i);
    expect(set).toMatch(/SameSite=Lax/i);
    expect(set).toMatch(/Path=\//);
    expect(set).not.toMatch(/Domain/i);
    expect(await (await t.call(cookie, "GET", "/admin/me")).json()).toEqual({ email: "ed@example.com", role: "editor", org: "lingjing" });
    // The log has the admin id, never the email.
    expect(JSON.stringify(t.lines)).not.toContain("ed@example.com");
  });

  it("not an admin, disabled, or another Google account: 403 not_admin", async () => {
    const t = await setup();
    expect((await t.signIn("stranger@example.com")).res.status).toBe(403);
    await t.signIn("ed@example.com", "sub-1"); // binds sub-1
    const other = await t.signIn("ed@example.com", "sub-2");
    expect(other.res.status).toBe(403);
    expect((await other.res.json()).error.code).toBe("not_admin");
    await disableAdmin(t.db, "ed@example.com");
    expect((await t.signIn("ed@example.com", "sub-1")).res.status).toBe(403);
  });

  it("every request re-checks: disabling or a role change applies at once", async () => {
    const t = await setup();
    const { cookie } = await t.signIn("ed@example.com");
    await t.db.update(admins).set({ role: "viewer" }).where(eq(admins.email, "ed@example.com"));
    expect((await t.call(cookie, "PUT", `/admin/content/case/${CASE}/draft`, { draftRevision: null, source: "x" })).status).toBe(403);
    await t.db.update(admins).set({ enabled: false }).where(eq(admins.email, "ed@example.com"));
    expect((await t.call(cookie, "GET", "/admin/me")).status).toBe(401);
  });

  it("logout ends the session; signing in again ends the old one", async () => {
    const t = await setup();
    const a = await t.signIn("ed@example.com");
    const b = await t.app.request("/admin/auth/google", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", cookie: a.cookie },
      body: JSON.stringify({ idToken: "ed@example.com" }),
    });
    expect(b.status).toBe(200);
    expect((await t.call(a.cookie, "GET", "/admin/me")).status).toBe(401);
    const c = await t.signIn("ed@example.com");
    expect((await t.call(c.cookie, "POST", "/admin/auth/logout", {})).status).toBe(204);
    expect((await t.call(c.cookie, "GET", "/admin/me")).status).toBe(401);
  });

  it("writes need the admin's Origin and JSON", async () => {
    const t = await setup();
    const { cookie } = await t.signIn("ed@example.com");
    const put = (headers: Record<string, string>) =>
      t.app.request(`/admin/content/case/${CASE}/draft`, { method: "PUT", headers: { cookie, ...headers }, body: JSON.stringify({ draftRevision: null, source: "x" }) });
    expect((await put({ "content-type": "application/json" })).status).toBe(403);
    expect((await put({ origin: "https://evil.novawerk.io", "content-type": "application/json" })).status).toBe(403);
    expect((await put({ origin: ORIGIN, "content-type": "text/plain" })).status).toBe(403);
    expect((await put({ origin: ORIGIN, "content-type": "application/json" })).status).toBe(200);
  });

  it("30 failed sign-ins in 10 minutes: 429 for everyone until the window ends", async () => {
    const t = await setup();
    for (let i = 0; i < LIMITS.signInFailures; i++) {
      const res = await t.app.request("/admin/auth/google", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ idToken: "bad" }) });
      expect(res.status).toBe(401);
    }
    const limited = await t.signIn("ed@example.com");
    expect(limited.res.status).toBe(429);
    expect(Number(limited.res.headers.get("retry-after"))).toBeGreaterThan(0);
    t.tick(LIMITS.signInWindowMs);
    expect((await t.signIn("ed@example.com")).res.status).toBe(200);
  });

  it("an unknown /admin path is a 404, signed in or not; /admin/accounts/delete is as before", async () => {
    const t = await setup();
    expect((await t.app.request("/admin/nope")).status).toBe(404);
    const { cookie } = await t.signIn("ed@example.com");
    expect((await t.call(cookie, "GET", "/admin/nope")).status).toBe(404);
    // Sign-in (AUTH_MODE) is off here: no such route, as before the admin.
    expect((await t.call(cookie, "POST", "/admin/accounts/delete", { email: "x@example.com" })).status).toBe(404);
  });

  it("an oversized body is a 400 before anything else, even on sign-in", async () => {
    const t = await setup();
    const res = await t.app.request("/admin/auth/google", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ idToken: "x".repeat(2 * 1024 * 1024) }) });
    expect(res.status).toBe(400);
  });

  it("without a session: 401", async () => {
    const t = await setup();
    expect((await t.app.request("/admin/me")).status).toBe(401);
    expect((await t.app.request("/admin/me", { headers: { cookie: `${SESSION_COOKIE}=nope` } })).status).toBe(401);
  });
});

describe("content", () => {
  it("lists what was imported as v1", async () => {
    const t = await setup();
    const { cookie } = await t.signIn("vi@example.com");
    const { items } = await (await t.call(cookie, "GET", "/admin/content")).json();
    expect(items.map((i: { kind: string; id: string }) => `${i.kind}:${i.id}`)).toEqual([`case:${CASE}`, `case:${PLACEHOLDER}`, "rubric:cbt"]);
    expect(items[0]).toMatchObject({ publishedVersion: 1, hasDraft: false, enMissing: false });
    const log = await (await t.call(cookie, "GET", "/admin/publish-log?limit=2")).json();
    expect(log.entries).toHaveLength(2);
    expect(log.entries[0]).toMatchObject({ action: "import", version: 1, publishedBy: null });
    const next = await (await t.call(cookie, "GET", `/admin/publish-log?limit=2&cursor=${log.nextCursor}`)).json();
    expect(next.entries).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
  });

  it("a viewer can't write", async () => {
    const t = await setup();
    const { cookie } = await t.signIn("vi@example.com");
    expect((await t.call(cookie, "PUT", `/admin/content/case/${CASE}/draft`, { draftRevision: null, source: "x" })).status).toBe(403);
    expect((await t.call(cookie, "POST", `/admin/content/case/${CASE}/preview-chat`, { locale: "zh", messages: [{ role: "counselor", text: "你好" }] })).status).toBe(403);
  });

  it("draft → publish → the app serves it; Slack gets one line without names", async () => {
    const t = await setup();
    const { cookie } = await t.signIn("ed@example.com");
    const item = await (await t.call(cookie, "GET", `/admin/content/case/${PLACEHOLDER}`)).json();
    const fm = { ...item.published.frontmatter, title: { zh: "新标题", en: "New title" } };
    const saved = await t.call(cookie, "PUT", `/admin/content/case/${PLACEHOLDER}/draft`, { draftRevision: null, frontmatter: fm, body: item.published.body });
    expect(saved.status).toBe(200);
    const draft = (await saved.json()).draft;
    expect(draft).toMatchObject({ baseVersion: 1, errors: [] });
    const rev = draft.revision as number;
    // The YAML comment in that frontmatter survives the edit.
    expect(draft.source).toContain("# 以下公开字段也是占位");
    expect(draft.source).toContain("zh: 新标题");

    const long = await t.call(cookie, "POST", `/admin/content/case/${PLACEHOLDER}/publish`, { draftRevision: rev, basePublishedVersion: 1, note: "长".repeat(201) });
    expect(long.status).toBe(400);
    t.tick(1000);
    const pub = await t.call(cookie, "POST", `/admin/content/case/${PLACEHOLDER}/publish`, { draftRevision: rev, basePublishedVersion: 1, note: "  改了标题  " });
    expect(pub.status).toBe(200);
    expect(await pub.json()).toMatchObject({ version: 2, action: "publish", note: "改了标题", publishedBy: { email: "ed@example.com", role: "editor" } });
    const log = await (await t.call(cookie, "GET", "/admin/publish-log?limit=1")).json();
    expect(log.entries[0]).toMatchObject({ id: PLACEHOLDER, version: 2, note: "改了标题" });
    await t.settle();
    expect(t.slack).toEqual([`病例 ${PLACEHOLDER} 发布了 v2（编辑）`]);

    const cases = (await (await t.app.request("/cases")).json()).cases;
    expect(cases.find((c: { id: string }) => c.id === PLACEHOLDER).title.zh).toBe("新标题");
    const after = await (await t.call(cookie, "GET", `/admin/content/case/${PLACEHOLDER}`)).json();
    expect(after.draft).toBeNull();
    expect(after.published.version).toBe(2);
  });

  it("an unchanged frontmatter keeps the file byte for byte", async () => {
    const t = await setup();
    const { cookie } = await t.signIn("ed@example.com");
    for (const id of [CASE, PLACEHOLDER]) {
      const item = await (await t.call(cookie, "GET", `/admin/content/case/${id}`)).json();
      const saved = await (await t.call(cookie, "PUT", `/admin/content/case/${id}/draft`, { draftRevision: null, frontmatter: item.published.frontmatter, body: item.published.body })).json();
      expect(saved.draft.source).toBe(item.published.source);
    }
  });

  it("publish refuses what the checks refuse (422), and stale revisions (409)", async () => {
    const t = await setup();
    const { cookie } = await t.signIn("ed@example.com");
    const item = await (await t.call(cookie, "GET", `/admin/content/case/${CASE}`)).json();
    const bad = item.published.source.replace(/^school: cbt$/m, "school: dbt");
    const saved = await (await t.call(cookie, "PUT", `/admin/content/case/${CASE}/draft`, { draftRevision: null, source: bad })).json();
    expect(saved.draft.errors.map((e: { path: string }) => e.path)).toEqual(["frontmatter.school"]);
    const rev = saved.draft.revision as number;
    const res = await t.call(cookie, "POST", `/admin/content/case/${CASE}/publish`, { draftRevision: rev, basePublishedVersion: 1 });
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0].path).toBe("frontmatter.school");
    expect((await t.call(cookie, "PUT", `/admin/content/case/${CASE}/draft`, { draftRevision: rev + 100, source: bad })).status).toBe(409);
    expect((await t.call(cookie, "POST", `/admin/content/case/${CASE}/publish`, { draftRevision: rev, basePublishedVersion: 2 })).status).toBe(409);
  });

  it("an outdated draft can't overwrite a newer version until rebased", async () => {
    const t = await setup();
    const { cookie } = await t.signIn("ed@example.com");
    const item = await (await t.call(cookie, "GET", `/admin/content/case/${PLACEHOLDER}`)).json();
    const src = item.published.source as string;
    // v2, then a draft from v2, then a rollback to v1 (v3): the draft is outdated.
    await t.call(cookie, "PUT", `/admin/content/case/${PLACEHOLDER}/draft`, { draftRevision: null, source: src.replace("毕业后的低落", "二版") });
    await t.call(cookie, "POST", `/admin/content/case/${PLACEHOLDER}/publish`, { draftRevision: await t.revisionOf(cookie, "case", PLACEHOLDER), basePublishedVersion: 1 });
    await t.call(cookie, "PUT", `/admin/content/case/${PLACEHOLDER}/draft`, { draftRevision: null, source: src.replace("毕业后的低落", "三版") });
    const rev = await t.revisionOf(cookie, "case", PLACEHOLDER);
    const rb = await t.call(cookie, "POST", `/admin/content/case/${PLACEHOLDER}/rollback`, { toVersion: 1, basePublishedVersion: 2 });
    expect(await rb.json()).toMatchObject({ version: 3, action: "rollback", fromVersion: 1, note: null });
    const outdated = await t.call(cookie, "POST", `/admin/content/case/${PLACEHOLDER}/publish`, { draftRevision: rev, basePublishedVersion: 3 });
    expect(outdated.status).toBe(409);
    expect((await outdated.json()).reason).toBe("draft_outdated");
    const rebased = await (await t.call(cookie, "PUT", `/admin/content/case/${PLACEHOLDER}/draft`, { draftRevision: rev, rebase: true, source: src.replace("毕业后的低落", "三版") })).json();
    expect(rebased.draft.baseVersion).toBe(3);
    expect(rebased.draft.revision).toBeGreaterThan(rev);
    expect((await t.call(cookie, "POST", `/admin/content/case/${PLACEHOLDER}/publish`, { draftRevision: rebased.draft.revision, basePublishedVersion: 3 })).status).toBe(200);
    await t.settle();
    expect(t.slack[1]).toBe(`病例 ${PLACEHOLDER} 回滚到 v1，生成 v3（编辑）`);
    const versions = (await (await t.call(cookie, "GET", `/admin/content/case/${PLACEHOLDER}/versions`)).json()).versions;
    expect(versions.map((v: { version: number; action: string }) => `${v.version}${v.action}`)).toEqual(["4publish", "3rollback", "2publish", "1import"]);
    expect((await (await t.call(cookie, "GET", `/admin/content/case/${PLACEHOLDER}/versions/3`)).json()).source).toBe(src);
  });

  it("a page holding an old draft can't save over a newer draft or publish it (revisions are never reused)", async () => {
    // Review of #108: A opens a draft (base v1); B publishes v2 and starts a new draft (base v2);
    // A's old page saves with its old revision, then publishes. Both must be 409.
    const t = await setup();
    const { cookie } = await t.signIn("ed@example.com");
    const src = (await (await t.call(cookie, "GET", `/admin/content/case/${PLACEHOLDER}`)).json()).published.source as string;
    await t.call(cookie, "PUT", `/admin/content/case/${PLACEHOLDER}/draft`, { draftRevision: null, source: src.replace("毕业后的低落", "A") });
    const aRev = await t.revisionOf(cookie, "case", PLACEHOLDER);
    // B publishes A's draft as it is (v2), then starts a draft of its own.
    expect((await t.call(cookie, "POST", `/admin/content/case/${PLACEHOLDER}/publish`, { draftRevision: aRev, basePublishedVersion: 1 })).status).toBe(200);
    await t.call(cookie, "PUT", `/admin/content/case/${PLACEHOLDER}/draft`, { draftRevision: null, source: src.replace("毕业后的低落", "B") });
    const bRev = await t.revisionOf(cookie, "case", PLACEHOLDER);
    expect(bRev).not.toBe(aRev);
    const aSave = await t.call(cookie, "PUT", `/admin/content/case/${PLACEHOLDER}/draft`, { draftRevision: aRev, source: src.replace("毕业后的低落", "A2") });
    expect(aSave.status).toBe(409);
    expect((await t.call(cookie, "POST", `/admin/content/case/${PLACEHOLDER}/publish`, { draftRevision: aRev, basePublishedVersion: 2 })).status).toBe(409);
    expect((await t.call(cookie, "DELETE", `/admin/content/case/${PLACEHOLDER}/draft`, { draftRevision: aRev })).status).toBe(409);
    const item = await (await t.call(cookie, "GET", `/admin/content/case/${PLACEHOLDER}`)).json();
    expect(item.draft.source).toContain("B");
    expect(item.published.version).toBe(2);
  });

  it("rollback runs the checks too (422)", async () => {
    const t = await setup();
    const { cookie } = await t.signIn("ed@example.com");
    // A version that no longer passes (as if the rules had changed since).
    await t.db.insert(contentVersions).values({ kind: "rubric", itemId: "cbt", version: 2, source: "---\nid: cbt\nschool: cbt\n---\nno ids", action: "publish", publishedAt: new Date(T0) });
    const item = await (await t.call(cookie, "GET", "/admin/content/rubric/cbt")).json();
    await t.db.insert(contentVersions).values({ kind: "rubric", itemId: "cbt", version: 3, source: item.published.source, action: "publish", publishedAt: new Date(T0) });
    const res = await t.call(cookie, "POST", "/admin/content/rubric/cbt/rollback", { toVersion: 2, basePublishedVersion: 3 });
    expect(res.status).toBe(422);
    expect((await t.call(cookie, "POST", "/admin/content/rubric/cbt/rollback", { toVersion: 3, basePublishedVersion: 3 })).status).toBe(400);
  });

  it("create a case, preview it (not counted), discard its draft", async () => {
    const t = await setup();
    const { cookie } = await t.signIn("ed@example.com");
    const item = await (await t.call(cookie, "GET", `/admin/content/case/${PLACEHOLDER}`)).json();
    const source = (item.published.source as string).replace(`id: ${PLACEHOLDER}`, "id: new-case");
    expect((await t.call(cookie, "POST", "/admin/content", { kind: "case", id: "new-case", source: item.published.source })).status).toBe(422);
    const created = await t.call(cookie, "POST", "/admin/content", { kind: "case", id: "new-case", source });
    expect(created.status).toBe(201);
    expect((await t.call(cookie, "POST", "/admin/content", { kind: "case", id: "new-case", source })).status).toBe(409);
    // Not in the app until published.
    expect((await (await t.app.request("/cases")).json()).cases.map((c: { id: string }) => c.id)).not.toContain("new-case");

    const res = await t.call(cookie, "POST", "/admin/content/case/new-case/preview-chat", { locale: "zh", messages: [{ role: "counselor", text: "你好" }] });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const text = await res.text();
    expect(text).toContain('"turn_start"');
    expect(text).toContain('"turn_end"');
    expect(t.mock.requests.at(-1)!.system).toContain("## 认知模式和核心信念"); // the draft's brief
    const huge = await t.call(cookie, "POST", "/admin/content/case/new-case/preview-chat", { locale: "zh", messages: [{ role: "counselor", text: "你好" }], source: "x".repeat(201 * 1024) });
    expect(huge.status).toBe(400);
    // Bad requests don't use up the hourly preview turns: only turns that reach the model do.
    for (let i = 0; i < LIMITS.previewPerAdminHour; i++) {
      expect((await t.call(cookie, "POST", "/admin/content/case/new-case/preview-chat", { locale: "zh", messages: [] })).status).toBe(400);
    }
    expect((await t.call(cookie, "POST", "/admin/content/case/new-case/preview-chat", { locale: "zh", messages: [{ role: "counselor", text: "再来" }] })).status).toBe(200);

    expect((await t.call(cookie, "DELETE", "/admin/content/case/new-case/draft", { draftRevision: (await created.json()).draft.revision })).status).toBe(204);
    expect((await t.call(cookie, "GET", "/admin/content/case/new-case")).status).toBe(404);
  });
});

describe("dashboard", () => {
  it("filters, sums by week, hides small cells; active is null with a filter", async () => {
    const t = await setup();
    const store = new DrizzleMetricsStore(t.db);
    const day = (d: string, n: number, e: Parameters<typeof store.increment>[1]) => Promise.all(Array.from({ length: n }, () => store.increment(d, e)));
    await day("2026-10-12", 7, { metric: "session_started", caseId: CASE, locale: "zh" });
    await day("2026-10-13", 2, { metric: "session_started", caseId: CASE, locale: "en" });
    await day("2026-10-14", 9, { metric: "session_started", caseId: PLACEHOLDER, locale: "zh" });
    await t.db.insert(dailyCounts).values({ day: "2026-10-14", metric: "active_day", count: 6 });
    const { cookie } = await t.signIn("vi@example.com");

    const week = await (await t.call(cookie, "GET", "/admin/dashboard?from=2026-10-12&to=2026-10-18&granularity=week")).json();
    expect(week.periods).toEqual(["2026-10-12"]);
    expect(week.series).toEqual([{ metric: "session_started", dim: "", points: [{ period: "2026-10-12", count: 18 }], total: 18 }]);
    expect(week.active.day.total).toBe(6);

    const byDay = await (await t.call(cookie, "GET", `/admin/dashboard?from=2026-10-12&to=2026-10-14&caseId=${CASE}`)).json();
    // 7 and 2 in one column: 2 is hidden, so 7 is too (else 9 − 7).
    expect(byDay.series[0].points.map((p: { count: unknown }) => p.count)).toEqual(["<5", "<5", 0]);
    expect(byDay.series[0].total).toBe(9);
    expect(byDay.active).toBeNull();
    expect(byDay.cases.map((c: { id: string }) => c.id)).toContain(CASE);
  });
});
