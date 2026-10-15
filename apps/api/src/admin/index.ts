// The admin routes (docs/admin-api.md, docs/decisions/0009-admin-phase1.md). Loaded with a
// dynamic import on the first /admin request that needs it, only with ADMIN_MODE=on.
//
// Sign-in: a Google ID token in, an httpOnly session cookie out. Every request looks the
// session up with its admin row, so disabling someone or changing a role applies at once.
// Logs carry admin ids, never emails, tokens or cookies.
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, gt, gte, isNull, lt, max, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

import type { Logger } from "../app.js";
import type { Auth } from "../auth/types.js";
import type { AdminConfig } from "../config.js";
import { CASE_ID, MAX_SOURCE_BYTES, SCHOOLS, check, checkCase, enMissing, split, titleOf, withFrontmatter, type Kind, type Problem } from "../content-doc.js";
import { postToSlack, type FetchLike } from "../feedback.js";
import { dashboardView } from "../metrics/dashboard.js";
import { statsRange } from "../metrics/stats.js";
import { DrizzleMetricsStore, type MetricsDb } from "../metrics/store.js";
import { FixedWindowLimiter } from "../rate-limit.js";
import { LocaleSchema, MAX_MESSAGES, MessageSchema } from "../schema.js";
import { rateCounters } from "../auth/schema.js";
import { googleVerifier, type GoogleVerifier } from "./google.js";
import { adminLogins, adminSessions, admins, contentDrafts, contentVersions } from "./schema.js";
import { readBody } from "../read-body.js";
import type { AdminHooks } from "./types.js";

/** __Host-: Secure, Path=/, no Domain; browsers take it on http://localhost too. */
export const SESSION_COOKIE = "__Host-psygym_admin";
export const SESSION_MS = 7 * 86_400_000;
export const LOGIN_LOG_MS = 90 * 86_400_000;
export const LIMITS = { signInFailures: 30, signInWindowMs: 10 * 60_000, previewPerAdminHour: 60 };
/** The one counter for failed sign-ins, in rate_counters (from 0001). Not per IP: see ADR 0009. */
const SIGN_IN_KEY = "admin-sign-in-failures";

export const ROLES = ["admin", "editor", "viewer"] as const;
export const ORGS = ["novawerk", "lingjing"] as const;
export type Role = (typeof ROLES)[number];
type Admin = typeof admins.$inferSelect;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface AdminDeps extends AdminHooks {
  config: AdminConfig;
  db: MetricsDb;
  logger: Logger;
  /** Sign-in of the app: the dashboard rolls up finished active days first, as /admin/stats does. */
  auth?: Auth | null;
  webhookUrl?: string | null;
  fetch?: FetchLike;
  now?: () => number;
  /** Tests inject a verifier; default: Google's keys. */
  verifyGoogle?: GoogleVerifier;
  keepAlive?: (p: Promise<unknown>) => void;
}

type Env = { Variables: { admin: Admin } };

type ErrorCode = "invalid_request" | "unauthorized" | "not_admin" | "forbidden" | "not_found" | "conflict" | "invalid_content" | "rate_limited" | "unavailable";
const MESSAGES: Record<ErrorCode, string> = {
  invalid_request: "The request is not valid.",
  unauthorized: "Please sign in.",
  not_admin: "This Google account has no access to the admin.",
  forbidden: "Not allowed.",
  not_found: "Not found.",
  conflict: "This changed in the meantime. Reload and try again.",
  invalid_content: "The content doesn't pass the checks.",
  rate_limited: "Too many requests. Please wait a moment.",
  unavailable: "The database can't be reached right now.",
};
type Status = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503;
const fail = (c: Context, status: Status, code: ErrorCode, extra: Record<string, unknown> = {}, message = MESSAGES[code]) =>
  c.json({ error: { code, message }, ...extra }, status);

/** A Postgres unique violation (two publishes at once, a draft created twice). */
const isConflict = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

const KIND_ZH: Record<Kind, string> = { case: "病例", rubric: "督导标准" };
const ROLE_ZH: Record<Role, string> = { admin: "管理员", editor: "编辑", viewer: "只读" };

const Kind = z.enum(["case", "rubric"]);
const Revision = z.number().int().min(1);
/** A new draft revision: never used before for any draft (see draftRevisions). */
const nextRevision = sql<number>`nextval('content_draft_revisions')`;
const Frontmatter = z.record(z.string(), z.unknown());
const Source = z.string().min(1);
/** {source} or {frontmatter, body}. */
const Doc = z.union([z.object({ source: Source }), z.object({ frontmatter: Frontmatter, body: z.string() })]);
const SignInBody = z.object({ idToken: z.string().min(1).max(8192) });
const DraftBody = z.intersection(z.object({ draftRevision: Revision.nullable(), rebase: z.literal(true).optional() }), Doc);
const CreateBody = z.intersection(z.object({ kind: Kind, id: z.string() }), Doc);
const DiscardBody = z.object({ draftRevision: Revision });
/** Optional "what changed": trimmed, at most 200 characters, empty means none. */
export const NOTE_MAX = 200;
const Note = z
  .string()
  .optional()
  .nullable()
  .transform((s) => s?.trim() || null)
  .refine((s) => s === null || [...s].length <= NOTE_MAX, `note is longer than ${NOTE_MAX} characters`);
const PublishBody = z.object({ draftRevision: Revision, basePublishedVersion: z.number().int().min(1).nullable(), note: Note });
const RollbackBody = z.object({ toVersion: z.number().int().min(1), basePublishedVersion: z.number().int().min(1), note: Note });
const PreviewBody = z
  .object({
    locale: LocaleSchema,
    messages: z.array(MessageSchema).min(1).max(MAX_MESSAGES),
    source: Source.refine((s) => Buffer.byteLength(s, "utf8") <= MAX_SOURCE_BYTES, `source is longer than ${MAX_SOURCE_BYTES / 1024} KB`).optional(),
  })
  .refine((b) => b.messages.at(-1)?.role === "counselor", { message: "the last message must be the counselor's", path: ["messages"] });
const DashboardQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  granularity: z.enum(["day", "week"]).default("day"),
  caseId: z.string().min(1).max(100).optional(),
  locale: LocaleSchema.optional(),
});

/** The source a {source} / {frontmatter, body} body asks for, on top of `old`. */
const sourceFrom = (doc: z.infer<typeof Doc>, old: string | null) => ("source" in doc ? doc.source : withFrontmatter(old, doc.frontmatter, doc.body));

/** A content item id in a path: case ids per content/README.md, rubric ids are schools. */
const validId = (kind: Kind, id: string) => (kind === "case" ? CASE_ID.test(id) : (SCHOOLS as readonly string[]).includes(id));

export function createAdmin(deps: AdminDeps): Hono {
  const { db, config, logger } = deps;
  const now = () => deps.now?.() ?? Date.now();
  const verifyGoogle = deps.verifyGoogle ?? googleVerifier(config.googleClientId);
  const previewLimiter = new FixedWindowLimiter(LIMITS.previewPerAdminHour, 3_600_000, deps.now);
  const later = (p: Promise<unknown>) => deps.keepAlive?.(p);

  const app = new Hono<Env>();

  app.onError((err, c) => {
    logger.error({ msg: "admin failed", route: c.req.path, error: (err as Error)?.constructor?.name ?? typeof err });
    return fail(c, 503, "unavailable");
  });
  app.notFound((c) => fail(c, 404, "not_found"));

  // Writes only from the admin page: the exact Origin and a JSON body. SameSite=Lax doesn't stop
  // other *.novawerk.io subdomains, which are the same site.
  app.use("/admin/*", async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
    const json = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase() === "application/json";
    if (c.req.header("origin") !== config.origin || !json) return fail(c, 403, "forbidden");
    return next();
  });

  /** The body, read with the app's 1 MB cap and validated; or the 400 to send. */
  async function body<T>(c: Context, schema: z.ZodType<T>): Promise<T | Response> {
    const read = await readBody(c.req.raw);
    if (read.tooLarge) {
      if (!read.drained) c.header("Connection", "close");
      return fail(c, 400, "invalid_request", {}, "The request body is too large.");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(read.text);
    } catch {
      raw = undefined;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return fail(c, 400, "invalid_request", {}, parsed.error.issues[0]?.message ?? MESSAGES.invalid_request);
    return parsed.data;
  }

  const me = (a: Admin) => ({ email: a.email, role: a.role as Role, org: a.org });

  // ── Sign-in ──

  /** The current failure window's start, and how many failed sign-ins it has so far. */
  async function signInFailures(): Promise<{ windowStart: Date; count: number }> {
    const windowStart = new Date(Math.floor(now() / LIMITS.signInWindowMs) * LIMITS.signInWindowMs);
    const [row] = await db
      .select({ count: rateCounters.count })
      .from(rateCounters)
      .where(and(eq(rateCounters.keyMac, SIGN_IN_KEY), gte(rateCounters.windowStart, windowStart)))
      .limit(1);
    return { windowStart, count: row?.count ?? 0 };
  }
  async function failedSignIn(windowStart: Date) {
    await db
      .insert(rateCounters)
      .values({ keyMac: SIGN_IN_KEY, windowStart, count: 1 })
      .onConflictDoUpdate({ target: [rateCounters.keyMac, rateCounters.windowStart], set: { count: sql`${rateCounters.count} + 1` } });
    await db.delete(rateCounters).where(and(eq(rateCounters.keyMac, SIGN_IN_KEY), lt(rateCounters.windowStart, windowStart)));
  }

  app.post("/admin/auth/google", async (c) => {
    const failures = await signInFailures();
    if (failures.count >= LIMITS.signInFailures) {
      c.header("Retry-After", String(Math.ceil((failures.windowStart.getTime() + LIMITS.signInWindowMs - now()) / 1000)));
      return fail(c, 429, "rate_limited");
    }
    const b = await body(c, SignInBody);
    if (b instanceof Response) return b;
    let google: { email: string; sub: string };
    try {
      google = await verifyGoogle(b.idToken);
    } catch {
      await failedSignIn(failures.windowStart);
      return fail(c, 401, "unauthorized", {}, "The Google sign-in didn't work. Please try again.");
    }
    let [admin] = await db.select().from(admins).where(eq(admins.email, google.email)).limit(1);
    // First sign-in: bind this Google account, unless another one got there first.
    if (admin && admin.enabled && admin.googleSub === null) {
      await db.update(admins).set({ googleSub: google.sub }).where(and(eq(admins.id, admin.id), isNull(admins.googleSub)));
      [admin] = await db.select().from(admins).where(eq(admins.id, admin.id)).limit(1);
    }
    // The Google account bound to this address, and no other.
    if (!admin || !admin.enabled || admin.googleSub !== google.sub) {
      await failedSignIn(failures.windowStart);
      logger.info({ msg: "admin sign-in refused", ...(admin ? { adminId: admin.id, subMismatch: admin.googleSub !== google.sub } : {}) });
      return fail(c, 403, "not_admin");
    }
    const token = randomBytes(32).toString("base64url");
    const at = new Date(now());
    // The session this browser had before, if any, ends here.
    const old = getCookie(c, SESSION_COOKIE);
    if (old) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, sha256(old)));
    await db.insert(adminSessions).values({ tokenHash: sha256(token), adminId: admin.id, createdAt: at, expiresAt: new Date(now() + SESSION_MS) });
    await db.insert(adminLogins).values({ adminId: admin.id, at });
    await db.update(admins).set({ lastLoginAt: at }).where(eq(admins.id, admin.id));
    // Housekeeping: expired sessions, logins past 90 days.
    await db.delete(adminSessions).where(lt(adminSessions.expiresAt, at));
    await db.delete(adminLogins).where(lt(adminLogins.at, new Date(now() - LOGIN_LOG_MS)));
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: SESSION_MS / 1000 });
    logger.info({ msg: "admin signed in", adminId: admin.id });
    return c.json(me(admin));
  });

  app.post("/admin/auth/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, sha256(token)));
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    return c.body(null, 204);
  });

  // Everything else needs a session of an enabled admin, looked up on every request. Only on our
  // own paths: an unknown /admin path is a 404, signed in or not.
  const signedIn = createMiddleware<Env>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return fail(c, 401, "unauthorized");
    const [row] = await db
      .select({ admin: admins })
      .from(adminSessions)
      .innerJoin(admins, eq(adminSessions.adminId, admins.id))
      .where(and(eq(adminSessions.tokenHash, sha256(token)), gt(adminSessions.expiresAt, new Date(now()))))
      .limit(1);
    if (!row || !row.admin.enabled) return fail(c, 401, "unauthorized");
    c.set("admin", row.admin);
    return next();
  });
  for (const path of ["/admin/me", "/admin/dashboard", "/admin/content", "/admin/content/*", "/admin/publish-log"]) app.use(path, signedIn);

  /** editor and admin write; viewer only reads. */
  const canWrite = (c: Context<Env>) => c.get("admin").role === "admin" || c.get("admin").role === "editor";

  app.get("/admin/me", (c) => c.json(me(c.get("admin"))));

  // ── Dashboard ──

  app.get("/admin/dashboard", async (c) => {
    const q = DashboardQuery.safeParse(c.req.query());
    const range = q.success ? statsRange(q.data.from, q.data.to, now()) : null;
    if (!q.success || !range) return fail(c, 400, "invalid_request", {}, "from/to must be YYYY-MM-DD, from ≤ to, at most 366 days.");
    if (deps.auth) await deps.auth.rollUp().catch((err) => logger.error({ msg: "active roll-up failed", error: (err as Error)?.constructor?.name }));
    const rows = await new DrizzleMetricsStore(db).rows(range.from, range.to);
    const snap = await deps.content.current();
    const cases = [...snap.cases.values()].map((x) => ({ id: x.id, title: { zh: x.title.zh, en: x.title.en === x.title.zh ? null : x.title.en } }));
    return c.json(dashboardView({ ...range, granularity: q.data.granularity, caseId: q.data.caseId ?? null, locale: q.data.locale ?? null }, rows, cases));
  });

  // ── Content ──

  /** Emails and roles of the admins in `ids`, for "who published / saved". */
  async function people(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const map = new Map<string, { email: string; role: Role }>();
    for (const id of wanted) {
      const [a] = await db.select({ email: admins.email, role: admins.role }).from(admins).where(eq(admins.id, id)).limit(1);
      if (a) map.set(id, { email: a.email, role: a.role as Role });
    }
    return (id: string | null) => (id ? (map.get(id) ?? null) : null);
  }

  type VersionRow = typeof contentVersions.$inferSelect;
  const versionInfo = (v: VersionRow, who: (id: string | null) => { email: string; role: Role } | null) => ({
    version: v.version,
    action: v.action,
    fromVersion: v.fromVersion,
    note: v.note,
    publishedAt: v.publishedAt.toISOString(),
    publishedBy: who(v.publishedBy),
  });
  const docOf = (source: string) => {
    const s = split(source);
    return { source, frontmatter: s?.frontmatter ?? null, body: s?.body ?? source };
  };

  async function latestVersion(kind: Kind, id: string): Promise<VersionRow | undefined> {
    const [v] = await db
      .select()
      .from(contentVersions)
      .where(and(eq(contentVersions.kind, kind), eq(contentVersions.itemId, id)))
      .orderBy(desc(contentVersions.version))
      .limit(1);
    return v;
  }
  async function draftOf(kind: Kind, id: string) {
    const [d] = await db.select().from(contentDrafts).where(and(eq(contentDrafts.kind, kind), eq(contentDrafts.itemId, id))).limit(1);
    return d;
  }

  /** GET /admin/content/:kind/:id; null when the item has neither a version nor a draft. */
  async function itemView(kind: Kind, id: string) {
    const [published, draft] = await Promise.all([latestVersion(kind, id), draftOf(kind, id)]);
    if (!published && !draft) return null;
    const who = await people([published?.publishedBy ?? null, draft?.updatedBy ?? null]);
    const checked = draft ? check(kind, id, draft.source) : null;
    return {
      kind,
      id,
      published: published ? { ...docOf(published.source), ...versionInfo(published, who) } : null,
      draft: draft
        ? {
            ...docOf(draft.source),
            revision: draft.revision,
            baseVersion: draft.baseVersion,
            updatedAt: draft.updatedAt.toISOString(),
            updatedBy: who(draft.updatedBy),
            errors: checked!.errors,
            warnings: checked!.warnings,
          }
        : null,
    };
  }

  /** The :kind and :id of a content path, or the 404 to send. */
  function itemParams(c: Context<Env>): { kind: Kind; id: string } | Response {
    const kind = Kind.safeParse(c.req.param("kind"));
    const id = c.req.param("id") ?? "";
    if (!kind.success || !validId(kind.data, id)) return fail(c, 404, "not_found");
    return { kind: kind.data, id };
  }

  const tooBig = (c: Context, source: string) =>
    Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES ? fail(c, 400, "invalid_request", {}, `The source is longer than ${MAX_SOURCE_BYTES / 1024} KB.`) : null;

  app.get("/admin/content", async (c) => {
    const kindQ = c.req.query("kind");
    const kind = kindQ === undefined ? null : Kind.safeParse(kindQ);
    if (kind && !kind.success) return fail(c, 400, "invalid_request");
    const latest = await db
      .selectDistinctOn([contentVersions.kind, contentVersions.itemId])
      .from(contentVersions)
      .orderBy(asc(contentVersions.kind), asc(contentVersions.itemId), desc(contentVersions.version));
    const drafts = await db.select().from(contentDrafts);
    const items = new Map<string, { kind: Kind; id: string; v?: VersionRow; d?: (typeof drafts)[number] }>();
    const at = (k: string, id: string) => {
      const key = `${k}\u0000${id}`;
      const it = items.get(key) ?? { kind: k as Kind, id };
      items.set(key, it);
      return it;
    };
    for (const v of latest) at(v.kind, v.itemId).v = v;
    for (const d of drafts) at(d.kind, d.itemId).d = d;
    const list = [...items.values()]
      .filter((it) => !kind || it.kind === kind.data)
      .sort((a, b) => (a.kind === b.kind ? (a.id < b.id ? -1 : 1) : a.kind < b.kind ? -1 : 1))
      .map((it) => {
        const source = it.v?.source ?? it.d!.source;
        return {
          kind: it.kind,
          id: it.id,
          title: titleOf(source),
          publishedVersion: it.v?.version ?? null,
          publishedAt: it.v?.publishedAt.toISOString() ?? null,
          hasDraft: Boolean(it.d),
          draftUpdatedAt: it.d?.updatedAt.toISOString() ?? null,
          enMissing: enMissing(it.kind, source),
        };
      });
    return c.json({ items: list });
  });

  app.post("/admin/content", async (c) => {
    if (!canWrite(c)) return fail(c, 403, "forbidden");
    const b = await body(c, CreateBody);
    if (b instanceof Response) return b;
    if (b.kind !== "case") return fail(c, 400, "invalid_request", {}, "Rubrics can't be created yet.");
    if (!CASE_ID.test(b.id)) return fail(c, 400, "invalid_request", {}, "The id may only have lower-case letters, digits and hyphens (3–64).");
    const source = sourceFrom(b, null);
    const big = tooBig(c, source);
    if (big) return big;
    if (split(source)?.frontmatter?.id !== b.id) {
      return fail(c, 422, "invalid_content", { errors: [{ path: "frontmatter.id", message: `must be "${b.id}"` }] satisfies Problem[] });
    }
    if ((await latestVersion("case", b.id)) || (await draftOf("case", b.id))) return fail(c, 409, "conflict", {}, "A case with this id exists.");
    try {
      await db.insert(contentDrafts).values({ kind: "case", itemId: b.id, source, revision: nextRevision, baseVersion: null, updatedBy: c.get("admin").id, updatedAt: new Date(now()) });
    } catch (err) {
      if (isConflict(err)) return fail(c, 409, "conflict", {}, "A case with this id exists.");
      throw err;
    }
    logger.info({ msg: "content draft created", kind: "case", id: b.id, adminId: c.get("admin").id });
    return c.json(await itemView("case", b.id), 201);
  });

  app.get("/admin/content/:kind/:id", async (c) => {
    const p = itemParams(c);
    if (p instanceof Response) return p;
    const view = await itemView(p.kind, p.id);
    return view ? c.json(view) : fail(c, 404, "not_found");
  });

  app.put("/admin/content/:kind/:id/draft", async (c) => {
    const p = itemParams(c);
    if (p instanceof Response) return p;
    if (!canWrite(c)) return fail(c, 403, "forbidden");
    const b = await body(c, DraftBody);
    if (b instanceof Response) return b;
    const [published, draft] = await Promise.all([latestVersion(p.kind, p.id), draftOf(p.kind, p.id)]);
    if (!published && !draft) return fail(c, 404, "not_found");
    const by = c.get("admin").id;
    const at = new Date(now());
    if (b.draftRevision === null) {
      if (draft) return fail(c, 409, "conflict", {}, "There is a draft already. Reload to see it.");
      const source = sourceFrom(b, published!.source);
      const big = tooBig(c, source);
      if (big) return big;
      try {
        await db.insert(contentDrafts).values({ kind: p.kind, itemId: p.id, source, revision: nextRevision, baseVersion: published!.version, updatedBy: by, updatedAt: at });
      } catch (err) {
        if (isConflict(err)) return fail(c, 409, "conflict");
        throw err;
      }
    } else {
      if (!draft || draft.revision !== b.draftRevision) return fail(c, 409, "conflict");
      const source = sourceFrom(b, draft.source);
      const big = tooBig(c, source);
      if (big) return big;
      // rebase: the editor has seen the current version; publishing over it is fine now.
      const baseVersion = b.rebase ? (published?.version ?? null) : draft.baseVersion;
      const updated = await db
        .update(contentDrafts)
        .set({ source, revision: nextRevision, baseVersion, updatedBy: by, updatedAt: at })
        .where(and(eq(contentDrafts.kind, p.kind), eq(contentDrafts.itemId, p.id), eq(contentDrafts.revision, b.draftRevision)))
        .returning({ revision: contentDrafts.revision });
      if (updated.length === 0) return fail(c, 409, "conflict");
    }
    logger.info({ msg: "content draft saved", kind: p.kind, id: p.id, adminId: by });
    return c.json(await itemView(p.kind, p.id));
  });

  app.delete("/admin/content/:kind/:id/draft", async (c) => {
    const p = itemParams(c);
    if (p instanceof Response) return p;
    if (!canWrite(c)) return fail(c, 403, "forbidden");
    const b = await body(c, DiscardBody);
    if (b instanceof Response) return b;
    const draft = await draftOf(p.kind, p.id);
    if (!draft) return fail(c, 404, "not_found");
    const gone = await db
      .delete(contentDrafts)
      .where(and(eq(contentDrafts.kind, p.kind), eq(contentDrafts.itemId, p.id), eq(contentDrafts.revision, b.draftRevision)))
      .returning({ revision: contentDrafts.revision });
    if (gone.length === 0) return fail(c, 409, "conflict");
    logger.info({ msg: "content draft discarded", kind: p.kind, id: p.id, adminId: c.get("admin").id });
    return c.body(null, 204);
  });

  /** After a publish or rollback: Slack (best effort) and this instance's copy, both in the background. */
  function announce(kind: Kind, id: string, text: string) {
    later(deps.content.refresh());
    if (!deps.webhookUrl) {
      logger.info({ msg: "publish notice not sent: not configured", kind, id });
      return;
    }
    later(
      postToSlack(deps.fetch ?? fetch, deps.webhookUrl, { text })
        .then((status) => {
          if (status < 200 || status >= 300) logger.error({ msg: "publish notice failed", kind, id, status });
        })
        .catch((err) => logger.error({ msg: "publish notice failed", kind, id, error: (err as Error)?.constructor?.name })),
    );
  }

  /** Across items: a case's school needs a rubric (published, or bundled). */
  async function crossProblems(kind: Kind, id: string, source: string): Promise<Problem[]> {
    if (kind !== "case") return [];
    const school = checkCase(id, source).value?.school;
    if (!school) return [];
    const snap = await deps.content.current();
    return snap.rubrics[school] ? [] : [{ path: "frontmatter.school", message: `no rubric for ${school}` }];
  }

  /** Inserts version `next`; a race with another publish (same primary key) is a 409. */
  async function insertVersion(c: Context<Env>, v: typeof contentVersions.$inferInsert, deleteDraftRevision?: number): Promise<Response | null> {
    try {
      await db.transaction(async (tx) => {
        await tx.insert(contentVersions).values(v);
        if (deleteDraftRevision !== undefined) {
          const gone = await tx
            .delete(contentDrafts)
            .where(and(eq(contentDrafts.kind, v.kind), eq(contentDrafts.itemId, v.itemId), eq(contentDrafts.revision, deleteDraftRevision)))
            .returning({ revision: contentDrafts.revision });
          if (gone.length === 0) throw new DraftMoved();
        }
      });
      return null;
    } catch (err) {
      if (err instanceof DraftMoved || isConflict(err)) return fail(c, 409, "conflict");
      throw err;
    }
  }

  app.post("/admin/content/:kind/:id/publish", async (c) => {
    const p = itemParams(c);
    if (p instanceof Response) return p;
    if (!canWrite(c)) return fail(c, 403, "forbidden");
    const b = await body(c, PublishBody);
    if (b instanceof Response) return b;
    const [published, draft] = await Promise.all([latestVersion(p.kind, p.id), draftOf(p.kind, p.id)]);
    if (!draft) return fail(c, 404, "not_found");
    const current = published?.version ?? null;
    if (draft.revision !== b.draftRevision || current !== b.basePublishedVersion) return fail(c, 409, "conflict");
    // Started before someone else's publish or rollback: it would overwrite it unseen.
    if (draft.baseVersion !== current) return fail(c, 409, "conflict", { reason: "draft_outdated" }, "Someone published a newer version after this draft was started. Look at it, then save the draft again.");
    const checked = check(p.kind, p.id, draft.source);
    const errors = [...checked.errors, ...(await crossProblems(p.kind, p.id, draft.source))];
    if (errors.length) return fail(c, 422, "invalid_content", { errors, warnings: checked.warnings });
    const admin = c.get("admin");
    const version = (published?.version ?? 0) + 1;
    const row = { kind: p.kind, itemId: p.id, version, source: draft.source, action: "publish", fromVersion: null, note: b.note, publishedBy: admin.id, publishedAt: new Date(now()) };
    const conflict = await insertVersion(c, row, draft.revision);
    if (conflict) return conflict;
    logger.info({ msg: "content published", kind: p.kind, id: p.id, version, adminId: admin.id });
    announce(p.kind, p.id, `${KIND_ZH[p.kind]} ${p.id} 发布了 v${version}（${ROLE_ZH[admin.role as Role]}）`);
    return c.json(versionInfo(row as VersionRow, () => ({ email: admin.email, role: admin.role as Role })));
  });

  app.post("/admin/content/:kind/:id/rollback", async (c) => {
    const p = itemParams(c);
    if (p instanceof Response) return p;
    if (!canWrite(c)) return fail(c, 403, "forbidden");
    const b = await body(c, RollbackBody);
    if (b instanceof Response) return b;
    const published = await latestVersion(p.kind, p.id);
    if (!published) return fail(c, 404, "not_found");
    if (published.version !== b.basePublishedVersion) return fail(c, 409, "conflict");
    if (b.toVersion === published.version) return fail(c, 400, "invalid_request", {}, "That is the current version.");
    const [target] = await db
      .select()
      .from(contentVersions)
      .where(and(eq(contentVersions.kind, p.kind), eq(contentVersions.itemId, p.id), eq(contentVersions.version, b.toVersion)))
      .limit(1);
    if (!target) return fail(c, 400, "invalid_request", {}, "No such version.");
    // The rules may have changed since that version: it must still pass them.
    const checked = check(p.kind, p.id, target.source);
    const errors = [...checked.errors, ...(await crossProblems(p.kind, p.id, target.source))];
    if (errors.length) return fail(c, 422, "invalid_content", { errors, warnings: checked.warnings });
    const admin = c.get("admin");
    const version = published.version + 1;
    const row = { kind: p.kind, itemId: p.id, version, source: target.source, action: "rollback", fromVersion: b.toVersion, note: b.note, publishedBy: admin.id, publishedAt: new Date(now()) };
    const conflict = await insertVersion(c, row);
    if (conflict) return conflict;
    logger.info({ msg: "content rolled back", kind: p.kind, id: p.id, version, fromVersion: b.toVersion, adminId: admin.id });
    announce(p.kind, p.id, `${KIND_ZH[p.kind]} ${p.id} 回滚到 v${b.toVersion}，生成 v${version}（${ROLE_ZH[admin.role as Role]}）`);
    return c.json(versionInfo(row as VersionRow, () => ({ email: admin.email, role: admin.role as Role })));
  });

  app.get("/admin/content/:kind/:id/versions", async (c) => {
    const p = itemParams(c);
    if (p instanceof Response) return p;
    const rows = await db
      .select()
      .from(contentVersions)
      .where(and(eq(contentVersions.kind, p.kind), eq(contentVersions.itemId, p.id)))
      .orderBy(desc(contentVersions.version));
    if (rows.length === 0 && !(await draftOf(p.kind, p.id))) return fail(c, 404, "not_found");
    const who = await people(rows.map((r) => r.publishedBy));
    return c.json({ versions: rows.map((r) => versionInfo(r, who)) });
  });

  app.get("/admin/content/:kind/:id/versions/:version", async (c) => {
    const p = itemParams(c);
    if (p instanceof Response) return p;
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) return fail(c, 404, "not_found");
    const [row] = await db
      .select()
      .from(contentVersions)
      .where(and(eq(contentVersions.kind, p.kind), eq(contentVersions.itemId, p.id), eq(contentVersions.version, version)))
      .limit(1);
    if (!row) return fail(c, 404, "not_found");
    const who = await people([row.publishedBy]);
    return c.json({ ...docOf(row.source), ...versionInfo(row, who) });
  });

  app.get("/admin/publish-log", async (c) => {
    const limit = Number(c.req.query("limit") ?? 50);
    const cursor = c.req.query("cursor");
    const offset = cursor === undefined ? 0 : Number(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return fail(c, 400, "invalid_request");
    const rows = await db
      .select()
      .from(contentVersions)
      .orderBy(desc(contentVersions.publishedAt), asc(contentVersions.kind), asc(contentVersions.itemId), desc(contentVersions.version))
      .limit(limit + 1)
      .offset(offset);
    const page = rows.slice(0, limit);
    const who = await people(page.map((r) => r.publishedBy));
    return c.json({
      entries: page.map((r) => ({ kind: r.kind, id: r.itemId, ...versionInfo(r, who) })),
      nextCursor: rows.length > limit ? Buffer.from(String(offset + limit)).toString("base64url") : null,
    });
  });

  // ── Preview chat ──

  app.post("/admin/content/case/:id/preview-chat", async (c) => {
    const id = c.req.param("id");
    if (!CASE_ID.test(id)) return fail(c, 404, "not_found");
    if (!canWrite(c)) return fail(c, 403, "forbidden");
    const admin = c.get("admin");
    const b = await body(c, PreviewBody);
    if (b instanceof Response) return b;
    let source = b.source;
    if (source === undefined) {
      source = (await draftOf("case", id))?.source ?? (await latestVersion("case", id))?.source;
      if (source === undefined) return fail(c, 404, "not_found");
    }
    const checked = checkCase(id, source);
    if (!checked.value) return fail(c, 422, "invalid_content", { errors: checked.errors, warnings: checked.warnings });
    // Only a turn that will reach the model counts against the limit.
    const retry = previewLimiter.take(`admin:${admin.id}`);
    if (retry) {
      c.header("Retry-After", String(retry));
      return fail(c, 429, "rate_limited");
    }
    logger.info({ msg: "preview chat", id, adminId: admin.id, messages: b.messages.length });
    return deps.previewTurn(c, checked.value, b.locale, b.messages);
  });

  return app as unknown as Hono;
}

class DraftMoved extends Error {}

// ── Commands (scripts/admin.ts) ──

const EmailSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.email().max(254));

/** admin:add — create, or update role and org and enable. */
export async function addAdmin(db: MetricsDb, input: { email: string; role: string; org: string }) {
  const email = EmailSchema.parse(input.email);
  const role = z.enum(ROLES).parse(input.role);
  const org = z.enum(ORGS).parse(input.org);
  const [row] = await db
    .insert(admins)
    .values({ id: randomUUID(), email, role, org, enabled: true })
    .onConflictDoUpdate({ target: admins.email, set: { role, org, enabled: true } })
    .returning();
  return row!;
}

/** admin:disable — and end their sessions. False if there is no such admin. */
export async function disableAdmin(db: MetricsDb, emailIn: string): Promise<boolean> {
  const email = EmailSchema.parse(emailIn);
  const [row] = await db.update(admins).set({ enabled: false }).where(eq(admins.email, email)).returning({ id: admins.id });
  if (!row) return false;
  await db.delete(adminSessions).where(eq(adminSessions.adminId, row.id));
  return true;
}

/** How many enabled admins there are (the command warns when it disables the last one). */
export async function enabledAdmins(db: MetricsDb): Promise<number> {
  const [r] = await db.select({ n: count() }).from(admins).where(eq(admins.enabled, true));
  return Number(r?.n ?? 0);
}

/** content:import — each file as version 1, unless the item has versions already. */
export async function importContent(db: MetricsDb, files: { kind: Kind; id: string; source: string }[], at = new Date()) {
  const problems = files.flatMap((f) => check(f.kind, f.id, f.source).errors.map((e) => `${f.kind} ${f.id}: ${e.path}: ${e.message}`));
  if (problems.length) throw new Error(`not imported, nothing written:\n${problems.join("\n")}`);
  const imported: string[] = [];
  const skipped: string[] = [];
  await db.transaction(async (tx) => {
    for (const f of files) {
      const [has] = await tx
        .select({ v: max(contentVersions.version) })
        .from(contentVersions)
        .where(and(eq(contentVersions.kind, f.kind), eq(contentVersions.itemId, f.id)));
      if (has?.v !== null && has?.v !== undefined) {
        skipped.push(`${f.kind} ${f.id}`);
        continue;
      }
      await tx.insert(contentVersions).values({ kind: f.kind, itemId: f.id, version: 1, source: f.source, action: "import", publishedAt: at });
      imported.push(`${f.kind} ${f.id}`);
    }
  });
  return { imported, skipped };
}
