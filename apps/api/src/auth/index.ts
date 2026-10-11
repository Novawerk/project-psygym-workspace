// Sign-in by email code (docs/decisions/0008-sign-in.md, contract: docs/api-contract.md#sign-in).
// Loaded with a dynamic import only when AUTH_MODE=on.
//
// What we keep: the email, the sign-up time, the invite batch, sessions. Codes, tokens and IPs only
// as MACs or hashes. Logs never carry an email, a code, a token or an IP.
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import { and, eq, gt, lt, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";

import type { Logger } from "../app.js";
import type { AuthConfig } from "../config.js";
import type { MetricsDb } from "../metrics/store.js";
import { dailyCounts } from "../metrics/schema.js";
import { clientIp } from "../rate-limit.js";
import { LocaleSchema } from "../schema.js";
import { type FetchLike, type SendCode } from "./email.js";
import { activeDay, activeWeek, loginCodes, rateCounters, sessions, users } from "./schema.js";
import type { Auth, AuthUser } from "./types.js";

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_TRIES = 5;
export const SESSION_MS = 90 * 86_400_000;
const HOUR_MS = 3_600_000;
export const LIMITS = {
  resendGapMs: 60_000,
  startsPerEmailHour: 5,
  startsPerIpHour: 20,
  verifiesPerIpHour: 30,
  /** Wrong invite codes per hour, all accounts together, before one Slack alert. */
  wrongInvitesAlert: 20,
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (key: string, msg: string) => createHmac("sha256", key).update(msg).digest("hex");
const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sameText = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** ISO 8601 week, e.g. "2026-W42", and the Sunday it ends on. */
export function isoWeek(ms: number): { week: string; sunday: string } {
  const d = new Date(utcDay(ms) + "T00:00:00Z");
  const dow = d.getUTCDay() || 7; // Monday 1 … Sunday 7
  const thursday = new Date(d.getTime() + (4 - dow) * 86_400_000);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - jan1) / 86_400_000 + 1) / 7);
  const sunday = new Date(d.getTime() + (7 - dow) * 86_400_000).toISOString().slice(0, 10);
  return { week: `${year}-W${String(week).padStart(2, "0")}`, sunday };
}

/** The Sunday an ISO week string ends on. */
function sundayOf(week: string): string {
  const [y, w] = week.split("-W").map(Number) as [number, number];
  const jan4 = Date.UTC(y, 0, 4);
  const jan4Dow = new Date(jan4).getUTCDay() || 7;
  const monday1 = jan4 - (jan4Dow - 1) * 86_400_000;
  return new Date(monday1 + ((w - 1) * 7 + 6) * 86_400_000).toISOString().slice(0, 10);
}

const EmailSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.email().max(254));
const StartBody = z.object({ email: EmailSchema, locale: LocaleSchema });
const VerifyBody = z.object({
  email: EmailSchema,
  code: z.string().trim().regex(/^\d{6}$/),
  inviteCode: z.string().trim().min(1).max(200).optional(),
});
const AdminDeleteBody = z.object({ email: EmailSchema });

type ErrorCode =
  | "invalid_request"
  | "rate_limited"
  | "invalid_code"
  | "invite_required"
  | "invite_invalid"
  | "sign_in_required"
  | "session_expired"
  | "not_found"
  | "unauthorized";
const MESSAGES: Record<ErrorCode, string> = {
  invalid_request: "The request body is not valid.",
  rate_limited: "Too many requests. Please wait a moment.",
  invalid_code: "The code is wrong or no longer valid.",
  invite_required: "An invite code is needed to sign up.",
  invite_invalid: "This invite code isn't valid.",
  sign_in_required: "Please sign in.",
  session_expired: "Your session has expired. Please sign in again.",
  not_found: "Not found.",
  unauthorized: "A valid admin token is required.",
};
const fail = (c: Context, status: 400 | 401 | 403 | 404 | 429, code: ErrorCode) => c.json({ error: { code, message: MESSAGES[code] } }, status);

/** What we may log about a failure: its kind and HTTP status only. */
const kind = (err: unknown) => {
  const e = err as { status?: number; constructor?: { name?: string } };
  return { error: e?.constructor?.name ?? typeof err, ...(e?.status ? { status: e.status } : {}) };
};

export interface AuthDeps {
  config: AuthConfig;
  db: MetricsDb;
  logger: Logger;
  now?: () => number;
  /** Vercel's waitUntil (or a test's collector): keeps the function alive for work after the answer. */
  keepAlive?: (p: Promise<unknown>) => void;
  /** Sends the code email. Unset (no RESEND_API_KEY): nothing is sent, one log line. */
  sendCode?: SendCode | null;
  /** Where the wrong-invite alert goes (the feedback Slack webhook); null: logged only. */
  alertWebhookUrl?: string | null;
  fetch?: FetchLike;
  /** Active-account counts need counting on (METRICS_ENABLED) and METRICS_ID_SECRET. */
  countsEnabled?: boolean;
}

export function createAuth(deps: AuthDeps): Auth {
  const { config, db, logger } = deps;
  const now = deps.now ?? Date.now;
  const keepAlive = deps.keepAlive ?? (() => {});
  const fetchFn = deps.fetch ?? fetch;
  const countActive = Boolean(deps.countsEnabled && config.idSecret);

  const later = (label: string, work: () => Promise<unknown>) => {
    const p = Promise.resolve()
      .then(work)
      .catch((err) => logger.error({ msg: `${label} failed`, ...kind(err) }));
    keepAlive(p);
  };

  /** Adds one to an hourly counter; the new count. Old hours are swept on the way. */
  async function bump(key: string): Promise<{ count: number; resetsInSec: number }> {
    const t = now();
    const start = new Date(Math.floor(t / HOUR_MS) * HOUR_MS);
    const keyMac = hmac(config.secret, key);
    const [row] = await db
      .insert(rateCounters)
      .values({ keyMac, windowStart: start, count: 1 })
      .onConflictDoUpdate({ target: [rateCounters.keyMac, rateCounters.windowStart], set: { count: sql`${rateCounters.count} + 1` } })
      .returning({ count: rateCounters.count });
    // Sweep finished hours only when a key opens a new hour (indexed on window_start).
    if (row!.count === 1) await db.delete(rateCounters).where(lt(rateCounters.windowStart, start));
    return { count: row!.count, resetsInSec: Math.max(1, Math.ceil((start.getTime() + HOUR_MS - t) / 1000)) };
  }

  const limited = (c: Context, retryAfterSec: number) => {
    c.header("Retry-After", String(retryAfterSec));
    return fail(c, 429, "rate_limited");
  };

  async function readJson(c: Context): Promise<unknown> {
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > 8 * 1024) return undefined;
    try {
      return await c.req.json();
    } catch {
      return undefined;
    }
  }

  const bearer = (c: Context) => c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;

  async function newSession(user: AuthUser) {
    const token = randomBytes(32).toString("base64url");
    const t = now();
    const expiresAt = new Date(t + SESSION_MS);
    await db.insert(sessions).values({ tokenHash: sha256(token), userId: user.id, createdAt: new Date(t), expiresAt, renewedOn: utcDay(t) });
    return { token, expiresAt: expiresAt.toISOString(), me: me(user) };
  }

  const me = (u: AuthUser) => ({ email: u.email, createdAt: u.createdAt.toISOString(), inviteBatch: u.inviteBatch });

  async function userByEmail(email: string): Promise<AuthUser | null> {
    const [u] = await db.select().from(users).where(eq(users.email, email));
    return u ?? null;
  }

  async function createUser(email: string, inviteBatch: string): Promise<AuthUser> {
    await db.insert(users).values({ id: randomUUID(), email, createdAt: new Date(now()), inviteBatch }).onConflictDoNothing({ target: users.email });
    return (await userByEmail(email))!;
  }

  /** Today's and this week's pseudonyms of an account (one key per day, one per ISO week). */
  function pseudonyms(userId: string, t: number) {
    const day = utcDay(t);
    const { week } = isoWeek(t);
    const dayKey = hmac(config.idSecret!, `day:${day}`);
    const weekKey = hmac(config.idSecret!, `week:${week}`);
    return { day, week, dayPid: hmac(dayKey, userId), weekPid: hmac(weekKey, userId) };
  }

  async function deleteAccount(user: AuthUser) {
    if (config.idSecret) {
      // Every day and week not rolled up yet: work out the account's pseudonym for each.
      const days = await db.selectDistinct({ day: activeDay.day }).from(activeDay);
      for (const { day } of days) {
        const pid = hmac(hmac(config.idSecret, `day:${day}`), user.id);
        await db.delete(activeDay).where(and(eq(activeDay.day, day), eq(activeDay.pid, pid)));
      }
      const weeks = await db.selectDistinct({ week: activeWeek.week }).from(activeWeek);
      for (const { week } of weeks) {
        const pid = hmac(hmac(config.idSecret, `week:${week}`), user.id);
        await db.delete(activeWeek).where(and(eq(activeWeek.week, week), eq(activeWeek.pid, pid)));
      }
    }
    await db.delete(loginCodes).where(eq(loginCodes.emailHash, sha256(user.email)));
    await db.delete(users).where(eq(users.id, user.id)); // sessions go with it (on delete cascade)
  }

  async function authenticate(token: string): Promise<AuthUser | null> {
    const t = now();
    const [row] = await db
      .select({ user: users, expiresAt: sessions.expiresAt, renewedOn: sessions.renewedOn, tokenHash: sessions.tokenHash })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date(t))));
    if (!row) return null;
    const today = utcDay(t);
    if (row.renewedOn !== today) {
      // 90 days from the last use; moved at most once a day.
      later("session renew", () =>
        db.update(sessions).set({ expiresAt: new Date(t + SESSION_MS), renewedOn: today }).where(eq(sessions.tokenHash, row.tokenHash)),
      );
    }
    return row.user;
  }

  let rolledUpTo = ""; // the last day this instance rolled up before
  /**
   * Finished days and ISO weeks go into daily_counts. Each instance adds only the rows it deleted
   * itself (DELETE … RETURNING), so two instances rolling up at once never count a row twice.
   */
  async function rollUp() {
    if (!countActive) return;
    const t = now();
    const today = utcDay(t);
    const { week: thisWeek } = isoWeek(t);
    const days = await db.delete(activeDay).where(lt(activeDay.day, today)).returning({ day: activeDay.day });
    for (const [day, n] of tally(days.map((d) => d.day))) await addCount(day, "active_day", n);
    const weeks = await db.delete(activeWeek).where(lt(activeWeek.week, thisWeek)).returning({ week: activeWeek.week });
    for (const [week, n] of tally(weeks.map((w) => w.week))) await addCount(sundayOf(week), "active_week", n);
    rolledUpTo = today;
  }

  const tally = (keys: string[]) => {
    const m = new Map<string, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };

  async function addCount(day: string, metric: string, count: number) {
    await db
      .insert(dailyCounts)
      .values({ day, metric, caseId: "", locale: "", dim: "", count })
      .onConflictDoUpdate({
        target: [dailyCounts.day, dailyCounts.metric, dailyCounts.caseId, dailyCounts.locale, dailyCounts.dim],
        set: { count: sql`${dailyCounts.count} + ${count}` },
      });
  }

  function markActive(user: AuthUser) {
    if (!countActive || user.inviteBatch === "review") return;
    later("active count", async () => {
      const p = pseudonyms(user.id, now());
      await db.insert(activeDay).values({ day: p.day, pid: p.dayPid }).onConflictDoNothing();
      await db.insert(activeWeek).values({ week: p.week, pid: p.weekPid }).onConflictDoNothing();
      if (rolledUpTo !== p.day) await rollUp();
    });
  }

  async function wrongInvite() {
    const { count } = await bump("invite-wrong");
    if (count !== LIMITS.wrongInvitesAlert + 1) return;
    logger.error({ msg: "wrong invite codes", lastHour: count });
    if (!deps.alertWebhookUrl) return;
    later("invite alert", () =>
      fetchFn(deps.alertWebhookUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `⚠️ PSYGYM: more than ${LIMITS.wrongInvitesAlert} wrong invite codes at sign-up in the last hour.` }),
        signal: AbortSignal.timeout(5000),
      }),
    );
  }

  const routes = new Hono();

  routes.post("/auth/start", async (c) => {
    const parsed = StartBody.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, 400, "invalid_request");
    const { email, locale } = parsed.data;
    const ip = await bump(`start-ip:${clientIp(c)}`);
    if (ip.count > LIMITS.startsPerIpHour) return limited(c, ip.resetsInSec);

    // The reviewer gets no email and no per-email limit; the fixed code works at verify.
    if (config.review && email === config.review.email) return c.body(null, 202);

    const t = now();
    const emailHash = sha256(email);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const at = new Date(t);
    const fresh = {
      codeMac: hmac(config.secret, `${emailHash}:${code}`),
      expiresAt: new Date(t + CODE_TTL_MS),
      triesLeft: CODE_TRIES,
      lastSentAt: at,
    };
    // One statement, so concurrent starts can't slip past the limits: the row is written only if
    // the last send is 60 s old and the hour has room (or a new hour starts).
    const hourOver = sql`${loginCodes.windowStart} <= ${new Date(t - HOUR_MS)}`;
    const [written] = await db
      .insert(loginCodes)
      .values({ emailHash, ...fresh, windowStart: at, sendsInWindow: 1 })
      .onConflictDoUpdate({
        target: loginCodes.emailHash,
        set: {
          ...fresh,
          windowStart: sql`case when ${hourOver} then ${at} else ${loginCodes.windowStart} end`,
          sendsInWindow: sql`case when ${hourOver} then 1 else ${loginCodes.sendsInWindow} + 1 end`,
        },
        setWhere: sql`${loginCodes.lastSentAt} <= ${new Date(t - LIMITS.resendGapMs)} and (${hourOver} or ${loginCodes.sendsInWindow} < ${LIMITS.startsPerEmailHour})`,
      })
      .returning({ emailHash: loginCodes.emailHash });
    if (!written) {
      const [row] = await db.select().from(loginCodes).where(eq(loginCodes.emailHash, emailHash));
      const gapLeft = row ? LIMITS.resendGapMs - (t - row.lastSentAt.getTime()) : LIMITS.resendGapMs;
      const hourLeft = row ? row.windowStart.getTime() + HOUR_MS - t : HOUR_MS;
      return limited(c, Math.max(1, Math.ceil((gapLeft > 0 ? gapLeft : hourLeft) / 1000)));
    }

    // After the answer: the response time says nothing about the email.
    if (deps.sendCode) later("code email", () => deps.sendCode!(email, code, locale).then(() => logger.info({ msg: "code email sent" })));
    else logger.error({ msg: "code email not sent: RESEND_API_KEY isn't set" });
    return c.body(null, 202);
  });

  routes.post("/auth/verify", async (c) => {
    const parsed = VerifyBody.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, 400, "invalid_request");
    const { email, code, inviteCode } = parsed.data;
    const ip = await bump(`verify-ip:${clientIp(c)}`);
    if (ip.count > LIMITS.verifiesPerIpHour) return limited(c, ip.resetsInSec);

    if (config.review && email === config.review.email) {
      if (!sameText(code, config.review.code)) return fail(c, 400, "invalid_code");
      const user = (await userByEmail(email)) ?? (await createUser(email, "review"));
      return c.json(await newSession(user), 200);
    }

    const t = now();
    const emailHash = sha256(email);
    // Take a try first, in one statement, so concurrent guesses can't share one: no try left (or
    // no live code) → invalid_code before any comparison.
    const [taken] = await db
      .update(loginCodes)
      .set({ triesLeft: sql`${loginCodes.triesLeft} - 1` })
      .where(and(eq(loginCodes.emailHash, emailHash), gt(loginCodes.triesLeft, 0), gt(loginCodes.expiresAt, new Date(t))))
      .returning({ codeMac: loginCodes.codeMac });
    if (!taken) return fail(c, 400, "invalid_code");
    if (!sameHex(hmac(config.secret, `${emailHash}:${code}`), taken.codeMac)) return fail(c, 400, "invalid_code");

    let user = await userByEmail(email);
    if (!user) {
      if (!inviteCode) {
        // Asking for the invite code doesn't use a try: give it back.
        await db.update(loginCodes).set({ triesLeft: sql`${loginCodes.triesLeft} + 1` }).where(eq(loginCodes.emailHash, emailHash));
        return fail(c, 403, "invite_required");
      }
      const batch = config.signupInvites.get(inviteCode);
      if (!batch) {
        await wrongInvite(); // the try stays used
        return fail(c, 403, "invite_invalid");
      }
    }
    // Use the code up, once: of two concurrent right answers only one gets a session.
    const [used] = await db.delete(loginCodes).where(eq(loginCodes.emailHash, emailHash)).returning({ emailHash: loginCodes.emailHash });
    if (!used) return fail(c, 400, "invalid_code");
    user ??= await createUser(email, config.signupInvites.get(inviteCode!)!);
    return c.json(await newSession(user), 200);
  });

  routes.post("/auth/logout", async (c) => {
    const token = bearer(c);
    if (!token) return fail(c, 401, "sign_in_required");
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
    return c.body(null, 204);
  });

  async function signedIn(c: Context): Promise<AuthUser | Response> {
    const token = bearer(c);
    if (!token) return fail(c, 401, "sign_in_required");
    return (await authenticate(token)) ?? fail(c, 401, "session_expired");
  }

  routes.get("/me", async (c) => {
    const user = await signedIn(c);
    return user instanceof Response ? user : c.json(me(user), 200);
  });

  routes.delete("/me", async (c) => {
    const user = await signedIn(c);
    if (user instanceof Response) return user;
    await deleteAccount(user);
    logger.info({ msg: "account deleted" });
    return c.body(null, 204);
  });

  // For a deletion asked for by email (novawerk.io/psygym/delete-account). Its own token.
  routes.post("/admin/accounts/delete", async (c) => {
    if (!config.adminToken) return fail(c, 404, "not_found");
    const token = bearer(c);
    if (!token || !sameText(token, config.adminToken)) return fail(c, 401, "unauthorized");
    const parsed = AdminDeleteBody.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, 400, "invalid_request");
    const user = await userByEmail(parsed.data.email);
    if (user) await deleteAccount(user);
    else await db.delete(loginCodes).where(eq(loginCodes.emailHash, sha256(parsed.data.email)));
    logger.info({ msg: "admin account delete", found: Boolean(user) }); // no email, not even a hash
    return c.body(null, 204);
  });

  routes.onError((err, c) => {
    logger.error({ msg: "auth failed", route: c.req.path, ...kind(err) });
    return c.json({ error: { code: "internal", message: "Something went wrong on our side." } }, 500);
  });

  return {
    mode: (t) => (config.requiredFrom !== null && t >= config.requiredFrom ? "required" : "optional"),
    authenticate,
    routes,
    markActive,
    rollUp,
  };
}
