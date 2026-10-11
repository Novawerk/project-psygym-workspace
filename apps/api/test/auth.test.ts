// Sign-in, against PGlite with the real migrations.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp, type Logger } from "../src/app.js";
import { createAuth, isoWeek, LIMITS } from "../src/auth/index.js";
import { resendSender } from "../src/auth/email.js";
import { activeDay, activeWeek, loginCodes, rateCounters, sessions, users } from "../src/auth/schema.js";
import { loadConfig } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import { createCounter, type CountEvent } from "../src/metrics/counter.js";
import { dailyCounts } from "../src/metrics/schema.js";
import type { MetricsDb } from "../src/metrics/store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = loadCases();
const prompts = loadPrompts();
const CASE_ID = [...cases.keys()][0]!;
const SECRET = "s".repeat(40);
const ID_SECRET = "i".repeat(40);
const INVITE = "k7m2q9x4h8wd";
const OLD_INVITE = "a1b2c3";
const ALICE = "alice@example.com";
const REVIEWER = "review@example.com";
const T0 = Date.UTC(2026, 9, 14, 9, 0); // a Wednesday
const HOUR = 3_600_000;
const DAY = 86_400_000;

type Env = Record<string, string>;

async function setup(env: Env = {}, opts: { countsEnabled?: boolean; failSend?: boolean; hangSend?: boolean } = {}) {
  const client = new PGlite();
  const db = drizzle(client) as unknown as MetricsDb;
  await migrate(drizzle(client), { migrationsFolder: path.join(here, "../drizzle") });
  let now = T0;
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const sent: { to: string; code: string; locale: string }[] = [];
  const posted: { url: string; body: string }[] = [];
  const pending: Promise<unknown>[] = [];
  const config = loadConfig({
    LLM_PROVIDER: "mock",
    AUTH_MODE: "on",
    DATABASE_URL: "postgres://unused",
    AUTH_SECRET: SECRET,
    METRICS_ID_SECRET: ID_SECRET,
    INVITE_CODES: `${OLD_INVITE},${INVITE}:pilot-1`,
    REVIEW_LOGIN_EMAIL: REVIEWER,
    REVIEW_LOGIN_CODE: "246810",
    ADMIN_TOKEN: "admin-secret-token",
    RATE_LIMIT_MAX: "1000",
    ...env,
  });
  const auth = config.auth
    ? createAuth({
        config: config.auth,
        db,
        logger,
        now: () => now,
        keepAlive: (p) => pending.push(p),
        sendCode: async (to, code, locale) => {
          if (opts.hangSend) return new Promise(() => {});
          if (opts.failSend) throw new TypeError("fetch failed");
          sent.push({ to, code, locale });
        },
        alertWebhookUrl: "https://hooks.slack.com/services/T/B/X",
        fetch: async (url, init) => {
          posted.push({ url, body: String(init.body) });
          return new Response("ok");
        },
        countsEnabled: opts.countsEnabled ?? true,
      })
    : null;
  const events: CountEvent[] = [];
  const counter = createCounter({ store: { increment: async (_d, e) => void events.push(e), rows: async () => [] }, keepAlive: (p) => pending.push(p), onError: () => {} });
  const app = createApp({ config, cases, prompts, logger, auth, counter, now: () => now });
  const flush = async () => {
    for (let i = 0; i < pending.length; i++) await pending[i];
  };
  const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(p, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.7", ...headers }, body: JSON.stringify(body) });
  const lastCode = (to = ALICE) => [...sent].reverse().find((s) => s.to === to)!.code;
  /** Signs an email in; for a new email, with the invite code. */
  const signIn = async (email = ALICE, inviteCode: string | undefined = INVITE) => {
    expect((await post("/auth/start", { email, locale: "zh" })).status).toBe(202);
    await flush();
    const res = await post("/auth/verify", { email, code: lastCode(email), ...(inviteCode ? { inviteCode } : {}) });
    expect(res.status).toBe(200);
    return (await res.json()) as { token: string; expiresAt: string; me: { email: string; createdAt: string; inviteBatch: string | null } };
  };
  const chat = (headers: Record<string, string>) =>
    post("/chat", { caseId: CASE_ID, locale: "zh", messages: [{ role: "counselor", text: "你好" }] }, headers);
  return {
    app, db, lines, sent, posted, events, flush, post, lastCode, signIn, chat,
    get now() { return now; },
    set now(v: number) { now = v; },
  };
}

const errCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe("sign-in off (AUTH_MODE unset)", () => {
  it("nothing changes: /health is {ok:true}; /auth/* and /me are 404", async () => {
    const s = await setup({ AUTH_MODE: "off" });
    expect(await (await s.app.request("/health")).json()).toEqual({ ok: true });
    expect((await s.post("/auth/start", { email: ALICE, locale: "zh" })).status).toBe(404);
    expect((await s.app.request("/me")).status).toBe(404);
  });

  it("AUTH_MODE=on without AUTH_SECRET stays off, with a config error", () => {
    const c = loadConfig({ AUTH_MODE: "on", DATABASE_URL: "postgres://x" });
    expect(c.auth).toBeNull();
    expect(c.errors.some((e) => e.startsWith("AUTH_MODE is on"))).toBe(true);
  });

  it("short invite codes work as X-Invite-Code only; batches are parsed", () => {
    const c = loadConfig({ AUTH_MODE: "on", DATABASE_URL: "postgres://x", AUTH_SECRET: SECRET, INVITE_CODES: `${OLD_INVITE},${INVITE}:pilot-1,zzzzzzzzzzzz` });
    expect([...c.inviteCodes!]).toEqual([OLD_INVITE, INVITE, "zzzzzzzzzzzz"]);
    expect([...c.auth!.signupInvites]).toEqual([[INVITE, "pilot-1"], ["zzzzzzzzzzzz", "default"]]);
    expect(c.errors).toContain("INVITE_CODES: 1 code(s) shorter than 12 characters work as X-Invite-Code only, not for sign-up");
  });
});

describe("/health and the mode", () => {
  it("optional before AUTH_REQUIRED_FROM, required from then", async () => {
    const s = await setup({ AUTH_REQUIRED_FROM: new Date(T0 + DAY).toISOString() });
    expect(await (await s.app.request("/health")).json()).toEqual({ ok: true, auth: "optional" });
    s.now = T0 + DAY;
    expect(await (await s.app.request("/health")).json()).toEqual({ ok: true, auth: "required" });
  });
});

describe("a new account", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("code, then invite code with the same code (L3), then a session; one email only", async () => {
    expect((await s.post("/auth/start", { email: "  Alice@Example.com ", locale: "en" })).status).toBe(202);
    await s.flush();
    expect(s.sent).toEqual([{ to: ALICE, code: expect.stringMatching(/^\d{6}$/), locale: "en" }]);
    const code = s.lastCode();

    const noInvite = await s.post("/auth/verify", { email: ALICE, code });
    expect(noInvite.status).toBe(403);
    expect(await errCode(noInvite)).toBe("invite_required");
    const [row1] = await s.db.select().from(loginCodes);
    expect(row1!.triesLeft).toBe(5); // no try used

    const wrong = await s.post("/auth/verify", { email: ALICE, code, inviteCode: "nope-nope-nope" });
    expect(wrong.status).toBe(403);
    expect(await errCode(wrong)).toBe("invite_invalid");
    const [row2] = await s.db.select().from(loginCodes);
    expect(row2!.triesLeft).toBe(4); // a wrong invite uses a try

    const ok = await s.post("/auth/verify", { email: ALICE, code, inviteCode: INVITE });
    expect(ok.status).toBe(200);
    const session = (await ok.json()) as { token: string; expiresAt: string; me: unknown };
    expect(session.me).toEqual({ email: ALICE, createdAt: new Date(T0).toISOString(), inviteBatch: "pilot-1" });
    expect(Date.parse(session.expiresAt)).toBe(T0 + 90 * DAY);
    expect(s.sent).toHaveLength(1);

    // The code is used up.
    expect(await errCode(await s.post("/auth/verify", { email: ALICE, code, inviteCode: INVITE }))).toBe("invalid_code");
    const [u] = await s.db.select().from(users);
    expect(u).toMatchObject({ email: ALICE, inviteBatch: "pilot-1" });
  });

  it("an old 6-character code can't create an account", async () => {
    await s.post("/auth/start", { email: ALICE, locale: "zh" });
    await s.flush();
    expect(await errCode(await s.post("/auth/verify", { email: ALICE, code: s.lastCode(), inviteCode: OLD_INVITE }))).toBe("invite_invalid");
  });

  it("an app updated from the old version sends the invite code on the first verify", async () => {
    await s.post("/auth/start", { email: ALICE, locale: "zh" });
    await s.flush();
    expect((await s.post("/auth/verify", { email: ALICE, code: s.lastCode(), inviteCode: INVITE })).status).toBe(200);
  });

  it("an existing account needs no invite code and ignores one", async () => {
    await s.signIn();
    s.now += 2 * 60_000;
    const again = await s.signIn(ALICE, undefined);
    expect(again.me.inviteBatch).toBe("pilot-1");
    s.now += 2 * 60_000;
    expect((await s.signIn(ALICE, "nope-nope-nope")).me.inviteBatch).toBe("pilot-1");
  });
});

describe("codes", () => {
  it("5 tries, then even the right code is refused", async () => {
    const s = await setup();
    await s.post("/auth/start", { email: ALICE, locale: "zh" });
    await s.flush();
    const code = s.lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await errCode(await s.post("/auth/verify", { email: ALICE, code: wrong }))).toBe("invalid_code");
    expect(await errCode(await s.post("/auth/verify", { email: ALICE, code, inviteCode: INVITE }))).toBe("invalid_code");
  });

  it("expires after 10 minutes; a new start replaces the old code", async () => {
    const s = await setup();
    await s.post("/auth/start", { email: ALICE, locale: "zh" });
    await s.flush();
    const first = s.lastCode();
    s.now += 10 * 60_000 + 1;
    expect(await errCode(await s.post("/auth/verify", { email: ALICE, code: first, inviteCode: INVITE }))).toBe("invalid_code");
    await s.post("/auth/start", { email: ALICE, locale: "zh" });
    await s.flush();
    const second = s.lastCode();
    if (second !== first) expect(await errCode(await s.post("/auth/verify", { email: ALICE, code: first, inviteCode: INVITE }))).toBe("invalid_code");
    expect((await s.post("/auth/verify", { email: ALICE, code: second, inviteCode: INVITE })).status).toBe(200);
  });

  it("bad bodies are 400", async () => {
    const s = await setup();
    for (const body of [{ email: "not-an-email", locale: "zh" }, { email: ALICE, locale: "fr" }, { email: ALICE }]) {
      expect(await errCode(await s.post("/auth/start", body))).toBe("invalid_request");
    }
    expect(await errCode(await s.post("/auth/verify", { email: ALICE, code: "12345" }))).toBe("invalid_request");
  });
});

describe("limits", () => {
  it("per email: one start per 60 s, 5 per hour, with Retry-After", async () => {
    const s = await setup();
    expect((await s.post("/auth/start", { email: ALICE, locale: "zh" })).status).toBe(202);
    const soon = await s.post("/auth/start", { email: ALICE, locale: "zh" });
    expect(soon.status).toBe(429);
    expect(soon.headers.get("retry-after")).toBe("60");
    for (let i = 0; i < 4; i++) {
      s.now += 61_000;
      expect((await s.post("/auth/start", { email: ALICE, locale: "zh" })).status).toBe(202);
    }
    s.now += 61_000;
    const sixth = await s.post("/auth/start", { email: ALICE, locale: "zh" });
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(60);
    s.now = T0 + HOUR + 1;
    expect((await s.post("/auth/start", { email: ALICE, locale: "zh" })).status).toBe(202);
  });

  it("per IP: 20 starts and 30 verifies an hour", async () => {
    const s = await setup();
    for (let i = 0; i < LIMITS.startsPerIpHour; i++) expect((await s.post("/auth/start", { email: `u${i}@example.com`, locale: "zh" })).status).toBe(202);
    expect((await s.post("/auth/start", { email: "x@example.com", locale: "zh" })).status).toBe(429);
    expect((await s.post("/auth/start", { email: "x@example.com", locale: "zh" }, { "X-Forwarded-For": "203.0.113.9" })).status).toBe(202);
    for (let i = 0; i < LIMITS.verifiesPerIpHour; i++) expect((await s.post("/auth/verify", { email: `v${i}@example.com`, code: "123456" })).status).toBe(400);
    expect((await s.post("/auth/verify", { email: "v@example.com", code: "123456" })).status).toBe(429);
  });
});

describe("the reviewer", () => {
  it("no email, the fixed code, no invite code, batch review; wrong codes never lock it", async () => {
    const s = await setup();
    expect((await s.post("/auth/start", { email: REVIEWER, locale: "en" })).status).toBe(202);
    await s.flush();
    expect(s.sent).toEqual([]);
    for (let i = 0; i < 8; i++) expect(await errCode(await s.post("/auth/verify", { email: REVIEWER, code: "000000" }))).toBe("invalid_code");
    const ok = await s.post("/auth/verify", { email: REVIEWER, code: "246810" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { me: { inviteBatch: string } }).me.inviteBatch).toBe("review");
    // Repeated starts aren't limited per email (still per IP).
    for (let i = 0; i < 6; i++) expect((await s.post("/auth/start", { email: REVIEWER, locale: "en" })).status).toBe(202);
  });

  it("the fixed code works for no other address", async () => {
    const s = await setup();
    await s.post("/auth/start", { email: ALICE, locale: "zh" });
    await s.flush();
    expect(await errCode(await s.post("/auth/verify", { email: ALICE, code: "246810", inviteCode: INVITE }))).toBe(s.lastCode() === "246810" ? "invite_required" : "invalid_code");
  });

  it("with REVIEW_* cleared, the address is an ordinary one", async () => {
    const s = await setup({ REVIEW_LOGIN_EMAIL: "", REVIEW_LOGIN_CODE: "" });
    await s.post("/auth/start", { email: REVIEWER, locale: "en" });
    await s.flush();
    expect(s.sent.map((x) => x.to)).toEqual([REVIEWER]);
  });
});

describe("the gate", () => {
  it("optional: a token or an invite code; a bad token is 401 even with a good invite code", async () => {
    const s = await setup({ INVITE_CODES: `${OLD_INVITE},${INVITE}:pilot-1` });
    const { token } = await s.signIn();
    expect((await s.chat({ Authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await s.chat({ "X-Invite-Code": OLD_INVITE })).status).toBe(200);
    const bad = await s.chat({ Authorization: "Bearer nope", "X-Invite-Code": OLD_INVITE });
    expect(bad.status).toBe(401);
    expect(await errCode(bad)).toBe("session_expired");
    expect(await errCode(await s.chat({}))).toBe("invite_required");
    expect((await s.app.request("/cases", { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
  });

  it("required: no token is 426 update_required; a token works", async () => {
    const s = await setup({ AUTH_REQUIRED_FROM: new Date(T0 + HOUR).toISOString() });
    const { token } = await s.signIn();
    s.now = T0 + HOUR;
    const old = await s.chat({ "X-Invite-Code": OLD_INVITE });
    expect(old.status).toBe(426);
    expect(await errCode(old)).toBe("update_required");
    expect((await s.app.request("/cases")).status).toBe(426);
    expect((await s.chat({ Authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await s.app.request("/health")).status).toBe(200);
  });
});

describe("sessions", () => {
  it("90 days from the last use, renewed on use (at most once a day)", async () => {
    const s = await setup();
    const { token } = await s.signIn();
    const h = { Authorization: `Bearer ${token}` };
    s.now += 89 * DAY;
    expect((await s.app.request("/me", { headers: h })).status).toBe(200);
    await s.flush();
    s.now += 89 * DAY;
    expect((await s.app.request("/me", { headers: h })).status).toBe(200);
    await s.flush();
    s.now += 90 * DAY + 1;
    expect(await errCode(await s.app.request("/me", { headers: h }))).toBe("session_expired");
  });

  it("logout ends this session only; always 204 with a token, 401 without", async () => {
    const s = await setup();
    const a = await s.signIn();
    s.now += 61_000;
    const b = await s.signIn(ALICE, undefined);
    expect((await s.post("/auth/logout", {}, { Authorization: `Bearer ${a.token}` })).status).toBe(204);
    expect(await errCode(await s.app.request("/me", { headers: { Authorization: `Bearer ${a.token}` } }))).toBe("session_expired");
    expect((await s.app.request("/me", { headers: { Authorization: `Bearer ${b.token}` } })).status).toBe(200);
    expect((await s.post("/auth/logout", {}, { Authorization: "Bearer unknown" })).status).toBe(204);
    expect(await errCode(await s.post("/auth/logout", {}))).toBe("sign_in_required");
    expect(await errCode(await s.app.request("/me"))).toBe("sign_in_required");
  });
});

describe("deleting an account", () => {
  it("DELETE /me: email, sessions, codes and today's active rows go; signing up again needs an invite", async () => {
    const s = await setup();
    const a = await s.signIn();
    s.now += 61_000;
    const b = await s.signIn(ALICE, undefined);
    expect((await s.chat({ Authorization: `Bearer ${a.token}` })).status).toBe(200);
    await (await s.chat({ Authorization: `Bearer ${a.token}` })).text();
    await s.flush();
    expect(await s.db.select().from(activeDay)).toHaveLength(1);
    await s.post("/auth/start", { email: ALICE, locale: "zh" }); // a pending code
    expect((await s.app.request("/me", { method: "DELETE", headers: { Authorization: `Bearer ${a.token}` } })).status).toBe(204);
    for (const t of [users, sessions, loginCodes, activeDay, activeWeek]) expect(await s.db.select().from(t)).toEqual([]);
    expect(await errCode(await s.app.request("/me", { headers: { Authorization: `Bearer ${b.token}` } }))).toBe("session_expired");
    s.now += 61_000;
    await s.post("/auth/start", { email: ALICE, locale: "zh" });
    await s.flush();
    expect(await errCode(await s.post("/auth/verify", { email: ALICE, code: s.lastCode() }))).toBe("invite_required");
  });

  it("POST /admin/accounts/delete: its own token; 204 either way; the log has a hash only", async () => {
    const s = await setup();
    await s.signIn();
    expect((await s.post("/admin/accounts/delete", { email: ALICE })).status).toBe(401);
    expect((await s.post("/admin/accounts/delete", { email: ALICE }, { Authorization: "Bearer wrong" })).status).toBe(401);
    const h = { Authorization: "Bearer admin-secret-token" };
    expect((await s.post("/admin/accounts/delete", { email: " ALICE@example.com " }, h)).status).toBe(204);
    expect(await s.db.select().from(users)).toEqual([]);
    expect((await s.post("/admin/accounts/delete", { email: "nobody@example.com" }, h)).status).toBe(204);
    expect(JSON.stringify(s.lines)).not.toContain(ALICE);
    const off = await setup({ ADMIN_TOKEN: "" });
    expect((await off.post("/admin/accounts/delete", { email: ALICE }, h)).status).toBe(404);
  });
});

describe("active accounts, pseudonymously", () => {
  it("a day and a week row per account; rolled up into daily_counts and deleted when over", async () => {
    const s = await setup();
    const a = await s.signIn();
    const b = await s.signIn("bob@example.com");
    for (const t of [a.token, a.token, b.token]) await (await s.chat({ Authorization: `Bearer ${t}` })).text();
    await s.flush();
    const day1 = await s.db.select().from(activeDay);
    expect(day1).toHaveLength(2);
    expect(await s.db.select().from(activeWeek)).toHaveLength(2);
    // The next day: a new pseudonym for the same account; yesterday is rolled up and gone.
    s.now += DAY;
    await (await s.chat({ Authorization: `Bearer ${a.token}` })).text();
    await s.flush();
    const day2 = await s.db.select().from(activeDay);
    expect(day2).toHaveLength(1);
    expect(day1.map((r) => r.pid)).not.toContain(day2[0]!.pid);
    const counts = await s.db.select().from(dailyCounts);
    expect(counts.filter((r) => r.metric === "active_day")).toMatchObject([{ day: "2026-10-14", count: 2 }]);
    // Next week: the ISO week rolls up on its Sunday.
    s.now = T0 + 7 * DAY;
    await (await s.chat({ Authorization: `Bearer ${b.token}` })).text();
    await s.flush();
    const weeks = (await s.db.select().from(dailyCounts)).filter((r) => r.metric === "active_week");
    expect(weeks).toMatchObject([{ day: isoWeek(T0).sunday, count: 2 }]);
    expect(isoWeek(T0)).toEqual({ week: "2026-W42", sunday: "2026-10-18" });
    // No email, account id or pseudonym in daily_counts.
    const all = JSON.stringify(await s.db.select().from(dailyCounts));
    const ids = (await s.db.select().from(users)).map((u) => u.id);
    for (const bit of [ALICE, ...ids, ...day1.map((r) => r.pid)]) expect(all).not.toContain(bit);
  });

  it("not for the reviewer, not without METRICS_ID_SECRET or counting off", async () => {
    for (const [env, opts] of [[{}, {}], [{ METRICS_ID_SECRET: "" }, {}], [{}, { countsEnabled: false }]] as [Env, { countsEnabled?: boolean }][]) {
      const s = await setup(env, opts);
      const r = await s.post("/auth/verify", { email: REVIEWER, code: "246810" });
      const { token } = (await r.json()) as { token: string };
      await (await s.chat({ Authorization: `Bearer ${token}` })).text();
      if (env.METRICS_ID_SECRET === "" || opts.countsEnabled === false) {
        const alice = await s.signIn();
        await (await s.chat({ Authorization: `Bearer ${alice.token}` })).text();
      }
      await s.flush();
      expect(await s.db.select().from(activeDay)).toEqual([]);
    }
  });
});

describe("wrong invite codes", () => {
  it("past 20 in an hour, one Slack alert; no email, code or IP in it", async () => {
    const s = await setup();
    let ip = 0;
    for (let i = 0; i < LIMITS.wrongInvitesAlert + 3; i++) {
      const email = `w${i}@example.com`;
      const h = { "X-Forwarded-For": `192.0.2.${++ip}` };
      await s.post("/auth/start", { email, locale: "zh" }, h);
      await s.flush();
      expect(await errCode(await s.post("/auth/verify", { email, code: s.lastCode(email), inviteCode: "guess-guess-guess" }, h))).toBe("invite_invalid");
    }
    await s.flush();
    expect(s.posted).toHaveLength(1);
    expect(s.posted[0]!.url).toContain("hooks.slack.com");
    expect(s.posted[0]!.body).not.toMatch(/example\.com|guess|192\.0\.2/);
  });
});

describe("email", () => {
  it("start answers 202 even when the send hangs or fails; the log has the error kind only", async () => {
    const hang = await setup({}, { hangSend: true });
    const t = Date.now();
    expect((await hang.post("/auth/start", { email: ALICE, locale: "zh" })).status).toBe(202);
    expect(Date.now() - t).toBeLessThan(2000);
    const fail = await setup({}, { failSend: true });
    expect((await fail.post("/auth/start", { email: ALICE, locale: "zh" })).status).toBe(202);
    await fail.flush();
    expect(fail.lines).toContainEqual({ msg: "code email failed", error: "TypeError" });
  });

  it("the Resend call: from, to, a subject with the code, plain text, no links", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const send = resendSender({ apiKey: "re_test", from: "聆镜 PSYGYM <no-reply@novawerk.io>", fetch: async (url, init) => (calls.push({ url, init }), new Response("{}")) });
    await send(ALICE, "123456", "zh");
    await send(ALICE, "654321", "en");
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const zh = JSON.parse(String(calls[0]!.init.body));
    expect(zh).toMatchObject({ from: "聆镜 PSYGYM <no-reply@novawerk.io>", to: [ALICE], subject: "聆镜 PSYGYM 验证码：123456" });
    expect(zh.text).toContain("你的验证码是 123456，10 分钟内有效。");
    expect(JSON.parse(String(calls[1]!.init.body)).subject).toBe("Your 聆镜 PSYGYM code: 654321");
    for (const c of calls) expect(String(c.init.body)).not.toMatch(/https?:\/\/|<a |<img/);
    const failing = resendSender({ apiKey: "k", from: "f", fetch: async () => new Response("no", { status: 422 }) });
    await expect(failing(ALICE, "1", "zh")).rejects.toThrow("resend 422");
  });
});

describe("privacy", () => {
  it("no email, code, token or IP in the log; IPs only as MACs in rate_counters", async () => {
    const s = await setup();
    const { token } = await s.signIn();
    await (await s.chat({ Authorization: `Bearer ${token}` })).text();
    await s.post("/auth/logout", {}, { Authorization: `Bearer ${token}` });
    await s.flush();
    const log = JSON.stringify(s.lines);
    for (const bit of [ALICE, token, s.lastCode(), "198.51.100.7"]) expect(log).not.toContain(bit);
    const counters = JSON.stringify(await s.db.select().from(rateCounters));
    expect(counters).not.toContain("198.51.100.7");
    const codes = JSON.stringify(await s.db.select().from(loginCodes));
    expect(codes).not.toContain(ALICE);
  });
});

describe("races (security review)", () => {
  it("concurrent wrong codes can't share a try: after 20 at once, even the right code is dead", async () => {
    const s = await setup();
    await s.post("/auth/start", { email: ALICE, locale: "zh" });
    await s.flush();
    const code = s.lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    // Many IPs, so the per-IP limit isn't what stops them.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => s.post("/auth/verify", { email: ALICE, code: wrong }, { "X-Forwarded-For": `192.0.2.${i + 1}` })),
    );
    expect(results.every((r) => r.status === 400)).toBe(true);
    const [row] = await s.db.select().from(loginCodes);
    expect(row!.triesLeft).toBe(0);
    expect(await errCode(await s.post("/auth/verify", { email: ALICE, code, inviteCode: INVITE }, { "X-Forwarded-For": "192.0.2.99" }))).toBe("invalid_code");
  });

  it("two right answers at once: one session, the other invalid_code", async () => {
    const s = await setup();
    await s.signIn(); // the account exists
    s.now += 61_000;
    await s.post("/auth/start", { email: ALICE, locale: "zh" });
    await s.flush();
    const code = s.lastCode();
    const r = await Promise.all([1, 2].map((i) => s.post("/auth/verify", { email: ALICE, code }, { "X-Forwarded-For": `192.0.2.${i}` })));
    expect(r.map((x) => x.status).sort()).toEqual([200, 400]);
  });

  it("concurrent starts send one email", async () => {
    const s = await setup();
    const r = await Promise.all(Array.from({ length: 8 }, (_, i) => s.post("/auth/start", { email: ALICE, locale: "zh" }, { "X-Forwarded-For": `192.0.2.${i + 1}` })));
    await s.flush();
    expect(r.filter((x) => x.status === 202)).toHaveLength(1);
    expect(r.filter((x) => x.status === 429)).toHaveLength(7);
    expect(s.sent).toHaveLength(1);
  });
});

describe("security review, the rest", () => {
  it("deleting an account clears its active rows of every day and week not rolled up yet", async () => {
    const s = await setup();
    const { token } = await s.signIn();
    await (await s.chat({ Authorization: `Bearer ${token}` })).text(); // day 1
    await s.flush();
    s.now += DAY; // day 2, no request before the delete: day 1 isn't rolled up
    expect(await s.db.select().from(activeDay)).toHaveLength(1);
    expect((await s.app.request("/me", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })).status).toBe(204);
    expect(await s.db.select().from(activeDay)).toEqual([]);
    expect(await s.db.select().from(activeWeek)).toEqual([]);
  });

  it("the reviewer's requests count nothing (no chat_turn, no auth, no active)", async () => {
    const s = await setup();
    const r = await s.post("/auth/verify", { email: REVIEWER, code: "246810" });
    const { token } = (await r.json()) as { token: string };
    await (await s.chat({ Authorization: `Bearer ${token}` })).text();
    await s.flush();
    expect(s.events).toEqual([]);
    // Someone else is counted as usual.
    const alice = await s.signIn();
    await (await s.chat({ Authorization: `Bearer ${alice.token}` })).text();
    await s.flush();
    expect(s.events.map((e) => e.metric).sort()).toEqual(["auth", "chat_turn", "session_started"]);
  });

  it("the admin delete log has no email and no hash of it", async () => {
    const s = await setup();
    await s.signIn();
    await s.post("/admin/accounts/delete", { email: ALICE }, { Authorization: "Bearer admin-secret-token" });
    expect(s.lines.filter((l) => l.msg === "admin account delete")).toEqual([{ msg: "admin account delete", found: true }]);
  });
});
