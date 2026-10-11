// Anonymous counts, against PGlite with the real migrations in drizzle/.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp, type Logger } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import { MockProvider } from "../src/llm/mock.js";
import type { ModelProvider } from "../src/llm/types.js";
import { postgresStore } from "../src/metrics/db.js";
import { DrizzleMetricsStore, type MetricsDb } from "../src/metrics/store.js";
import { createCounter, disabledCounter, normalizeEvent, type CountEvent, type MetricsStore } from "../src/metrics/counter.js";
import { statsView } from "../src/metrics/stats.js";
import { dailyCounts } from "../src/metrics/schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = loadCases();
const prompts = loadPrompts();
const CASE_ID = [...cases.keys()][0]!;
const NOW = Date.UTC(2026, 9, 17, 9, 30);
const SECRET = "这是一句绝不能进库的话";
const INVITE = "secret-invite-batch1";
const IP = "203.0.113.77";

async function freshStore() {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: path.join(here, "../drizzle") });
  return { store: new DrizzleMetricsStore(db as unknown as MetricsDb), db };
}

function makeApp(
  store: MetricsStore | null,
  opts: { env?: Record<string, string>; providerFor?: () => ModelProvider; counterOn?: boolean } = {},
) {
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const pending: Promise<unknown>[] = [];
  const counter =
    store && opts.counterOn !== false
      ? createCounter({
          store,
          now: () => NOW,
          keepAlive: (p) => pending.push(p),
          onError: (err, e) => logger.error({ msg: "count failed", metric: e.metric, error: (err as Error)?.constructor?.name }),
        })
      : disabledCounter;
  const app = createApp({
    config: loadConfig({ LLM_PROVIDER: "mock", ADMIN_STATS_TOKEN: "admin-token", ...opts.env }),
    cases,
    prompts,
    logger,
    counter,
    metricsStore: store,
    now: () => NOW,
    ...(opts.providerFor ? { providerFor: opts.providerFor } : {}),
  });
  /** Waits for every count write started so far. */
  const flush = async () => {
    for (let i = 0; i < pending.length; i++) await pending[i];
  };
  return { app, lines, flush };
}

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
const chat = (messages: { role: string; text: string }[], locale = "zh") => ({ caseId: CASE_ID, locale, messages });

async function rows(db: Awaited<ReturnType<typeof freshStore>>["db"]) {
  const all = await db.select().from(dailyCounts);
  return all.map(({ metric, caseId, locale, dim, count, durationSumSec, durationCount }) => ({ metric, caseId, locale, dim, count, durationSumSec, durationCount }));
}
const find = (rs: Awaited<ReturnType<typeof rows>>, metric: string, dim = "") => rs.filter((r) => r.metric === metric && r.dim === dim);

describe("what we count", () => {
  let s: Awaited<ReturnType<typeof freshStore>>;
  beforeEach(async () => {
    s = await freshStore();
  });

  it("a session: started on the counselor's first line, turns, ended by the client, report with turns and duration", async () => {
    const { app, flush } = makeApp(s.store);
    const t1 = [{ role: "counselor", text: "你好" }];
    await (await app.request("/chat", json(chat(t1)))).text();
    const t2 = [...t1, { role: "client", text: "嗯" }, { role: "counselor", text: "说说看 #end" }];
    await (await app.request("/chat", json(chat(t2)))).text();
    // The client may speak first: still one counselor line, still the start.
    await (await app.request("/chat", json(chat([{ role: "client", text: "我先说" }, { role: "counselor", text: "好" }], "en")))).text();
    const report = { ...chat([...t2, { role: "client", text: "我先走了。" }]), durationSec: 600 };
    expect((await app.request("/supervision", json(report))).status).toBe(200);
    await (await app.request("/supervision", json({ ...report, durationSec: 1200 }))).text();
    await flush();
    const r = await rows(s.db);
    expect(find(r, "session_started").map((x) => [x.caseId, x.locale, x.count]).sort()).toEqual([
      [CASE_ID, "en", 1],
      [CASE_ID, "zh", 1],
    ]);
    expect(find(r, "session_started").reduce((n, x) => n + x.count, 0)).toBe(2);
    expect(find(r, "chat_turn").reduce((n, x) => n + x.count, 0)).toBe(3);
    expect(find(r, "session_ended_by_client")).toMatchObject([{ caseId: CASE_ID, locale: "zh", count: 1 }]);
    expect(find(r, "report_generated", "1-5")).toMatchObject([{ caseId: CASE_ID, locale: "zh", count: 2, durationSumSec: 1800, durationCount: 2 }]);
    // 600 s is 10 minutes (10–20); 1200 s is 20 minutes (20–40).
    expect(find(r, "session_duration", "10-20m")).toMatchObject([{ count: 1 }]);
    expect(find(r, "session_duration", "20-40m")).toMatchObject([{ count: 1 }]);
  });

  it("duration buckets: 0–5, 5–10, 10–20, 20–40, 40+ minutes; none without durationSec", async () => {
    const { app, flush } = makeApp(s.store);
    for (const d of [0, 299, 300, 599, 600, 1199, 1200, 2399, 2400, 7200, undefined]) {
      const res = await app.request("/supervision", json({ ...chat([{ role: "counselor", text: "你好" }]), ...(d === undefined ? {} : { durationSec: d }) }));
      await res.text();
    }
    await flush();
    const r = (await rows(s.db)).filter((x) => x.metric === "session_duration");
    expect(Object.fromEntries(r.map((x) => [x.dim, x.count]))).toEqual({ "0-5m": 2, "5-10m": 2, "10-20m": 2, "20-40m": 2, "40m+": 2 });
  });

  it("turn buckets: 1–5, 6–15, 16–30, 31+", async () => {
    const { app, flush } = makeApp(s.store);
    for (const n of [5, 6, 15, 16, 30, 31]) {
      const messages = Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "client" : "counselor", text: "x" }));
      await (await app.request("/supervision", json(chat(messages)))).text();
    }
    await flush();
    const r = await rows(s.db);
    expect(Object.fromEntries(r.filter((x) => x.metric === "report_generated").map((x) => [x.dim, x.count]))).toEqual({ "1-5": 1, "6-15": 2, "16-30": 2, "31+": 1 });
  });

  it("durationSec outside 0–7200 or not a whole number is ignored, never a 400", async () => {
    const { app, flush } = makeApp(s.store);
    for (const d of [7201, -1, 1.5, "600", null, true]) {
      const res = await app.request("/supervision", json({ ...chat([{ role: "counselor", text: "你好" }]), durationSec: d }));
      expect(res.status, String(d)).toBe(200);
      await res.text();
    }
    // An old app without the field works the same.
    const old = await app.request("/supervision", json(chat([{ role: "counselor", text: "你好" }])));
    expect(old.status).toBe(200);
    await old.text();
    await flush();
    const r = find(await rows(s.db), "report_generated", "1-5");
    expect(r).toMatchObject([{ count: 7, durationSumSec: 0, durationCount: 0 }]);
  });

  it("feedback by rating, reports by reason", async () => {
    const { app, flush } = makeApp(s.store);
    await app.request("/feedback", json({ caseId: CASE_ID, locale: "en", rating: "up", comment: SECRET }));
    await app.request("/feedback", json({ caseId: CASE_ID, locale: "en", rating: "down" }));
    await app.request("/report", json({ caseId: CASE_ID, locale: "zh", source: "client_reply", reason: "out_of_role", reportedText: SECRET }));
    await flush();
    const r = await rows(s.db);
    expect(find(r, "feedback", "up")).toMatchObject([{ caseId: CASE_ID, locale: "en", count: 1 }]);
    expect(find(r, "feedback", "down")).toMatchObject([{ count: 1 }]);
    expect(find(r, "user_report", "out_of_role")).toMatchObject([{ caseId: CASE_ID, locale: "zh", count: 1 }]);
  });

  it("errors by code only: no case, no language; 401 and 429 aren't counted", async () => {
    const { app, flush } = makeApp(s.store, { env: { INVITE_CODES: INVITE, RATE_LIMIT_MAX: "1" } });
    const ok = { "X-Invite-Code": INVITE };
    await app.request("/cases"); // 401
    await (await app.request("/chat", json(chat([{ role: "counselor", text: "你好" }]), ok))).text(); // 200
    await app.request("/chat", json(chat([{ role: "counselor", text: "你好" }]), ok)); // 429
    await app.request("/feedback", json({ caseId: "no-such-case", locale: "zh", rating: "up" }, ok)); // 404
    await app.request("/report", json({ caseId: CASE_ID }, ok)); // 400
    await flush();
    const errs = (await rows(s.db)).filter((x) => x.metric === "error");
    // 401 (before the rate limit) and 429 would let anyone write to the database without end.
    expect(Object.fromEntries(errs.map((x) => [x.dim, x.count]))).toEqual({ case_not_found: 1, invalid_request: 1 });
    for (const e of errs) expect([e.caseId, e.locale]).toEqual(["", ""]);
  });

  it("503 model_unavailable, and a stream error on /supervision → report_failed + stream_error", async () => {
    const down = makeApp(s.store, { env: { LLM_PROVIDER: "deepseek" } });
    await down.app.request("/chat", json(chat([{ role: "counselor", text: "你好" }])));
    await down.flush();
    const failing: ModelProvider = {
      name: "x",
      model: "x",
      buildRequest: (r) => r,
      stream: async () => {
        throw new Error("vendor down");
      },
    };
    const broken = makeApp(s.store, { providerFor: () => failing });
    await (await broken.app.request("/supervision", json(chat([{ role: "counselor", text: "你好" }])))).text();
    await broken.flush();
    const r = await rows(s.db);
    expect(find(r, "error", "model_unavailable")).toMatchObject([{ count: 1 }]);
    expect(find(r, "error", "stream_error")).toMatchObject([{ count: 1 }]);
    expect(find(r, "report_failed")).toMatchObject([{ caseId: CASE_ID, locale: "zh", count: 1 }]);
    expect(find(r, "report_generated", "1-5")).toEqual([]);
  });

  it("a client that disconnects isn't counted", async () => {
    let release!: () => void;
    const slow: ModelProvider = {
      name: "slow",
      model: "slow",
      buildRequest: (r) => r,
      stream: (req) => new Promise((_, reject) => {
        release = () => reject(new Error("aborted"));
        req.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    };
    const { app, flush } = makeApp(s.store, { providerFor: () => slow });
    const ctl = new AbortController();
    const res = await app.request(new Request("http://x/chat", { ...json(chat([{ role: "counselor", text: "你好" }])), signal: ctl.signal }));
    const reader = res.body!.getReader();
    await reader.read();
    ctl.abort();
    await reader.cancel().catch(() => {});
    release?.();
    await new Promise((r) => setTimeout(r, 20));
    await flush();
    expect(await rows(s.db)).toEqual([]);
  });
});

describe("normalizeEvent", () => {
  it("unknown case ids and languages become 'unknown'; missing ones stay missing", () => {
    expect(normalizeEvent({ metric: "feedback", caseId: CASE_ID, locale: "zh" }, cases)).toMatchObject({ caseId: CASE_ID, locale: "zh" });
    expect(normalizeEvent({ metric: "feedback", caseId: SECRET, locale: "fr" }, cases)).toMatchObject({ caseId: "unknown", locale: "unknown" });
    const e = normalizeEvent({ metric: "error", dim: "rate_limited" }, cases);
    expect(e).not.toHaveProperty("caseId");
    expect(e).not.toHaveProperty("locale");
  });
});

describe("never in the database or the log: text, invite codes, IPs", () => {
  it("after a full session with all of them in play", async () => {
    const s = await freshStore();
    const { app, flush, lines } = makeApp(s.store, { env: { INVITE_CODES: INVITE } });
    const h = { "X-Invite-Code": INVITE, "X-Forwarded-For": IP };
    const messages = [{ role: "counselor", text: SECRET }];
    await (await app.request("/chat", json(chat(messages), h))).text();
    await (await app.request("/supervision", json({ ...chat(messages), durationSec: 300 }, h))).text();
    await app.request("/feedback", json({ caseId: CASE_ID, locale: "zh", rating: "down", comment: SECRET }, h));
    await app.request("/report", json({ caseId: CASE_ID, locale: "zh", source: "report", reason: "harmful", reportedText: SECRET, comment: SECRET }, h));
    await app.request("/chat", json({ caseId: SECRET, locale: "zh", messages }, h)); // unknown case: its id is user input
    await app.request("/chat", json(chat(messages), { "X-Invite-Code": "wrong-code", "X-Forwarded-For": IP }));
    await flush();
    const everything = JSON.stringify(await s.db.select().from(dailyCounts)) + JSON.stringify(lines);
    for (const bit of [SECRET, INVITE, "wrong-code", IP]) expect(everything).not.toContain(bit);
    // Every stored case id is a known case, or "".
    for (const r of await s.db.select().from(dailyCounts)) expect(["", ...cases.keys()]).toContain(r.caseId);
  });
});

describe("when the database is down", () => {
  it("requests answer as usual; one log line per failed write, no details", async () => {
    // A real Postgres client pointed at a port where nothing listens.
    const store = postgresStore("postgres://psygym:psygym@127.0.0.1:1/psygym");
    const { app, flush, lines } = makeApp(store);
    const chatRes = await app.request("/chat", json(chat([{ role: "counselor", text: SECRET }])));
    expect(chatRes.status).toBe(200);
    expect(await chatRes.text()).toContain('"type":"turn_end"');
    expect((await app.request("/supervision", json(chat([{ role: "counselor", text: "你好" }])))).status).toBe(200);
    expect((await app.request("/feedback", json({ caseId: CASE_ID, locale: "zh", rating: "up" }))).status).toBe(204);
    await flush();
    const failed = lines.filter((l) => l.msg === "count failed");
    expect(failed.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(lines)).not.toContain("127.0.0.1");
    expect(JSON.stringify(lines)).not.toContain(SECRET);
  });

  it("a write that hangs doesn't hold up the stream", async () => {
    const hanging: MetricsStore = { increment: () => new Promise(() => {}), rows: async () => [] };
    const { app } = makeApp(hanging);
    const started = Date.now();
    const res = await app.request("/chat", json(chat([{ role: "counselor", text: "你好" }])));
    expect(await res.text()).toContain('"type":"turn_end"');
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("when counting is off", () => {
  it("METRICS_ENABLED must be true and DATABASE_URL set", () => {
    const db = "postgres://u:p@localhost:5432/x";
    expect(loadConfig({ DATABASE_URL: db }).metrics).toBeNull();
    expect(loadConfig({ METRICS_ENABLED: "false", DATABASE_URL: db }).metrics).toBeNull();
    expect(loadConfig({ METRICS_ENABLED: "true" }).metrics).toBeNull();
    expect(loadConfig({ METRICS_ENABLED: "true", DATABASE_URL: db }).metrics).toEqual({ databaseUrl: db });
  });

  it("not a single write, whatever happens", async () => {
    const events: CountEvent[] = [];
    const spy: MetricsStore = { increment: async (_d, e) => void events.push(e), rows: async () => [] };
    const { app } = makeApp(spy, { counterOn: false });
    await (await app.request("/chat", json(chat([{ role: "counselor", text: "你好 #end" }])))).text();
    await (await app.request("/supervision", json({ ...chat([{ role: "counselor", text: "你好" }]), durationSec: 60 }))).text();
    await app.request("/feedback", json({ caseId: CASE_ID, locale: "zh", rating: "up" }));
    await app.request("/report", json({ caseId: CASE_ID }));
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual([]);
  });

  it("/admin/stats says so", async () => {
    const { app } = makeApp(null);
    const res = await app.request("/admin/stats", { headers: { Authorization: "Bearer admin-token" } });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("metrics_disabled");
  });
});

describe("GET /admin/stats", () => {
  const auth = { Authorization: "Bearer admin-token" };

  async function seeded() {
    const s = await freshStore();
    const ev = (metric: CountEvent["metric"], n: number, extra: Partial<CountEvent> = {}) =>
      Array.from({ length: n }, () => s.store.increment("2026-10-16", { metric, caseId: CASE_ID, locale: "zh", ...extra }));
    await Promise.all([
      ...ev("session_started", 7),
      ...ev("session_started", 2, { locale: "en" }),
      ...ev("report_generated", 6, { dim: "1-5", durationSec: 600 }),
      ...ev("report_generated", 3, { dim: "6-15", durationSec: 900 }),
    ]);
    await s.store.increment("2026-10-17", { metric: "feedback", caseId: CASE_ID, locale: "zh", dim: "up" });
    return s;
  }

  it("404 when ADMIN_STATS_TOKEN isn't set; 401 for a missing or wrong token", async () => {
    const s = await freshStore();
    const off = makeApp(s.store, { env: { ADMIN_STATS_TOKEN: "" } });
    expect((await off.app.request("/admin/stats", { headers: auth })).status).toBe(404);
    const { app } = makeApp(s.store);
    expect((await app.request("/admin/stats")).status).toBe(401);
    expect((await app.request("/admin/stats", { headers: { Authorization: "Bearer nope" } })).status).toBe(401);
    expect((await app.request("/admin/stats", { headers: { Authorization: "admin-token" } })).status).toBe(401);
  });

  it("needs no invite code, and isn't counted as an error", async () => {
    const s = await freshStore();
    const { app, flush } = makeApp(s.store, { env: { INVITE_CODES: INVITE } });
    expect((await app.request("/admin/stats", { headers: auth })).status).toBe(200);
    await flush();
    expect(await rows(s.db)).toEqual([]);
  });

  it("cells and totals under 5 show <5; duration averages hide under 5 sessions", async () => {
    const s = await seeded();
    const { app } = makeApp(s.store);
    const res = await app.request("/admin/stats?from=2026-10-16&to=2026-10-17", { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      from: string;
      to: string;
      minShown: number;
      cells: Record<string, unknown>[];
      totals: Record<string, unknown>[];
    };
    expect(body).toMatchObject({ from: "2026-10-16", to: "2026-10-17", minShown: 5 });
    const cell = (metric: string, extra: Record<string, unknown>) => body.cells.find((c) => c.metric === metric && Object.entries(extra).every(([k, v]) => c[k] === v));
    // en (2) is under 5; zh (7) is hidden too, or the total (9) minus 7 would give en away.
    expect(cell("session_started", { locale: "zh" })).toMatchObject({ day: "2026-10-16", caseId: CASE_ID, count: "<5" });
    expect(cell("session_started", { locale: "en" })).toMatchObject({ count: "<5" });
    expect(cell("report_generated", { dim: "1-5" })).toMatchObject({ count: 6, durationSec: { sessions: 6, avgSec: 600 } });
    expect(cell("report_generated", { dim: "6-15" })).toMatchObject({ count: "<5", durationSec: { sessions: "<5", avgSec: null } });
    expect(cell("feedback", { dim: "up" })).toMatchObject({ day: "2026-10-17", count: "<5" });
    const total = (metric: string, dim = "") => body.totals.find((t) => t.metric === metric && t.dim === dim);
    expect(total("session_started")).toEqual({ metric: "session_started", dim: "", count: 9 });
    // Totals under 5 are hidden too: a group of one small cell would give it away.
    expect(total("report_generated", "6-15")).toEqual({ metric: "report_generated", dim: "6-15", count: "<5", durationSec: { sessions: "<5", avgSec: null } });
    expect(total("report_generated", "1-5")).toEqual({ metric: "report_generated", dim: "1-5", count: 6, durationSec: { sessions: 6, avgSec: 600 } });
    expect(total("feedback", "up")).toMatchObject({ count: "<5" });
  });

  it("never hides just one cell in a group; leaves the rest alone", () => {
    const row = (locale: string, count: number, day = "2026-10-16") => ({
      day,
      metric: "chat_turn",
      caseId: CASE_ID,
      locale,
      dim: "",
      count,
      durationSumSec: 0,
      durationCount: 0,
    });
    const view = (rs: ReturnType<typeof row>[]) => statsView("2026-10-16", "2026-10-17", rs).cells.map((c) => c.count);
    expect(view([row("zh", 3), row("en", 8), row("zh", 20, "2026-10-17")])).toEqual(["<5", "<5", 20]); // 8 is the next smallest
    expect(view([row("zh", 3), row("en", 4), row("zh", 20, "2026-10-17")])).toEqual(["<5", "<5", 20]); // two hidden already
    expect(view([row("zh", 6), row("en", 8)])).toEqual([6, 8]);
    expect(view([row("zh", 2)])).toEqual(["<5"]); // alone: nothing else to hide
    // Durations follow the same rule.
    const d = (n: number, sum: number) => ({ ...row("zh", 10), dim: "1-5", metric: "report_generated", durationCount: n, durationSumSec: sum });
    const cells = statsView("2026-10-16", "2026-10-17", [d(2, 100), { ...d(6, 600), locale: "en" }]).cells;
    expect(cells.map((c) => c.durationSec)).toEqual([
      { sessions: "<5", avgSec: null },
      { sessions: "<5", avgSec: null },
    ]);
  });

  it("defaults to the last 30 days; rejects bad ranges", async () => {
    const s = await seeded();
    const { app } = makeApp(s.store);
    const def = (await (await app.request("/admin/stats", { headers: auth })).json()) as { from: string; to: string };
    expect(def).toMatchObject({ from: "2026-09-18", to: "2026-10-17" });
    for (const q of ["from=2026-10-17&to=2026-10-16", "from=yesterday", "from=2025-01-01&to=2026-10-17", "to=2026-13-40"]) {
      expect((await app.request(`/admin/stats?${q}`, { headers: auth })).status, q).toBe(400);
    }
  });
});
