// The HTTP surface from docs/api-contract.md:
//
//   GET  /health       → {"ok":true}
//   GET  /cases        → {"cases": CaseSummary[]}
//   POST /chat         → text/event-stream, the AI client's reply
//   POST /supervision  → text/event-stream, one supervision report in Markdown
//   POST /feedback     → 204, a rating of the report, forwarded to Slack (or dropped)
//   POST /report       → 204, one reported AI passage, forwarded to Slack (or dropped)
//
// Stateless. We store no transcript, and the log never carries message text.
import { createHash, timingSafeEqual } from "node:crypto";

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { z } from "zod";

import type { AppConfig, Role } from "./config.js";
import { publicSummary, type Case, type Prompts } from "./content.js";
import { createProvider, type ModelProvider } from "./llm/index.js";
import type { ModelRequest } from "./llm/types.js";
import { FeedbackBody, postToSlack, slackMessage, type FetchLike } from "./feedback.js";
import { disabledCounter, durationBucket, normalizeEvent, turnBucket, type Counter, type MetricsStore } from "./metrics/counter.js";
import { statsView } from "./metrics/stats.js";
import { FixedWindowLimiter, clientIp } from "./rate-limit.js";
import { ReportBody, reportSlackMessage } from "./report.js";
import { ChatBody, SupervisionBody, type ErrorCode, type Locale, type StreamEvent } from "./schema.js";
import { FAREWELL, clientRequest, endsSession, liveSupervisorRequest, supervisorRequest } from "./session.js";

/** Keeps proxies from closing the stream while the model thinks. */
export const PING_MS = 15_000;
/** 80 messages × 2000 characters of CJK is ~480 KB of UTF-8; leave room for JSON. */
const MAX_BODY_BYTES = 1024 * 1024;

export interface Logger {
  info(line: Record<string, unknown>): void;
  error(line: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  info: (line) => console.log(JSON.stringify(line)),
  error: (line) => console.error(JSON.stringify(line)),
};

export interface AppDeps {
  config: AppConfig;
  cases: Map<string, Case>;
  prompts: Prompts;
  /** Tests inject scripted providers here. Default: built from config.llm. */
  providerFor?: (role: Role) => ModelProvider;
  logger?: Logger;
  now?: () => number;
  /** Tests inject a fake Slack here. Default: global fetch. */
  fetch?: FetchLike;
  /** How long we wait for Slack. Default 5 s. */
  slackTimeoutMs?: number;
  /** Anonymous counts. Default: off. */
  counter?: Counter;
  /** Where GET /admin/stats reads from; null when counting is off. */
  metricsStore?: MetricsStore | null;
  pingMs?: number;
}

const MESSAGES: Record<ErrorCode, string> = {
  invalid_request: "The request body is not valid.",
  invite_required: "An invite code is required.",
  case_not_found: "Unknown case.",
  rate_limited: "Too many requests. Please wait a moment.",
  model_unavailable: "The model is not available right now.",
};

const fail = (c: Context, status: 400 | 401 | 404 | 429 | 503, code: ErrorCode, message = MESSAGES[code]) =>
  c.json({ error: { code, message } }, status);

/** Past MAX_BODY_BYTES we keep reading (and dropping) up to this, so the client can finish sending. */
const MAX_DRAIN_BYTES = 16 * 1024 * 1024;

type BodyRead = { tooLarge: false; text: string } | { tooLarge: true; drained: boolean };

/**
 * Reads the request body with a size cap. An oversized body is read to its end and dropped
 * (up to MAX_DRAIN_BYTES), so the client isn't cut off mid-upload and the connection survives.
 */
async function readBody(req: Request): Promise<BodyRead> {
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (declared > MAX_DRAIN_BYTES) {
    await req.body?.cancel().catch(() => {});
    return { tooLarge: true, drained: false };
  }
  if (!req.body) return { tooLarge: false, text: "" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DRAIN_BYTES) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true, drained: false };
      }
      if (total <= MAX_BODY_BYTES) chunks.push(value);
      else chunks.length = 0;
    }
  } catch {
    return { tooLarge: true, drained: false };
  }
  if (total > MAX_BODY_BYTES) return { tooLarge: true, drained: true };
  return { tooLarge: false, text: Buffer.concat(chunks).toString("utf8") };
}

/** Constant-time comparison for the admin token; hashing first hides its length too. */
function sameToken(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const DAY_MS = 86_400_000;
/** ?from=&to= as UTC days. Default: the last 30 days up to today. */
function statsRange(from: string | undefined, to: string | undefined, nowMs: number) {
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  const t = to ?? new Date(nowMs).toISOString().slice(0, 10);
  if (!ok(t)) return null;
  const f = from ?? new Date(Date.parse(`${t}T00:00:00Z`) - 29 * DAY_MS).toISOString().slice(0, 10);
  if (!ok(f)) return null;
  const days = (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / DAY_MS;
  if (days < 0 || days > 365) return null;
  return { from: f, to: t };
}

/** The model finished without any text to show. */
class EmptyReplyError extends Error {
  constructor(readonly stop: string) {
    super("empty reply");
  }
}

/** What we may log about a failure: its kind and HTTP status, never its message (it can echo input). */
function describe(err: unknown) {
  const e = err as { name?: string; status?: number; constructor?: { name?: string } };
  return { error: e?.constructor?.name ?? e?.name ?? typeof err, status: e?.status };
}

export function createApp(deps: AppDeps) {
  const { config, cases, prompts } = deps;
  const logger = deps.logger ?? consoleLogger;
  const pingMs = deps.pingMs ?? PING_MS;
  const rawCounter = deps.counter ?? disabledCounter;
  // Every count goes through normalizeEvent: unknown case ids and languages become "unknown".
  const counter: Counter = { enabled: rawCounter.enabled, count: (e) => rawCounter.count(normalizeEvent(e, cases)) };
  /**
   * The error answer, counted by its code only (no case, language, invite code or IP).
   * 401 and 429 are not counted: they come before or from the rate limit, so anyone could make
   * us write to the database without end.
   */
  const failCounted = (c: Context, status: 400 | 401 | 404 | 429 | 503, code: ErrorCode, message?: string) => {
    if (code !== "invite_required" && code !== "rate_limited") counter.count({ metric: "error", dim: code });
    return fail(c, status, code, message);
  };
  const limiter = new FixedWindowLimiter(config.rateLimit.max, config.rateLimit.windowMs, deps.now);
  // Feedback has its own bucket: rating a report never eats into chat turns.
  const feedbackLimiter = new FixedWindowLimiter(config.rateLimit.max, config.rateLimit.windowMs, deps.now);
  const reportLimiter = new FixedWindowLimiter(config.rateLimit.max, config.rateLimit.windowMs, deps.now);

  const providers = new Map<Role, ModelProvider>();
  function providerFor(role: Role): ModelProvider | string {
    if (deps.providerFor) return deps.providerFor(role);
    const cached = providers.get(role);
    if (cached) return cached;
    const cfg = config.llm[role];
    if (!cfg.ok) return cfg.reason;
    try {
      const p = createProvider(cfg.llm);
      providers.set(role, p);
      return p;
    } catch (err) {
      return `could not create provider: ${(err as Error).message}`;
    }
  }

  for (const error of config.errors) logger.error({ msg: "config error", error });
  for (const role of ["client", "supervisor"] as const) {
    const cfg = config.llm[role];
    if (!deps.providerFor) {
      if (cfg.ok) logger.info({ msg: "model", role, provider: cfg.llm.provider, model: cfg.llm.model });
      else logger.error({ msg: "model unavailable", role, reason: cfg.reason });
    }
  }

  const app = new Hono();

  app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "X-Invite-Code"], exposeHeaders: ["Retry-After"] }));

  app.get("/health", (c) => c.json({ ok: true }));

  // GET /admin/stats: anonymous counts for us, not for the app. Its own token, no invite code.
  // Without ADMIN_STATS_TOKEN the endpoint doesn't exist.
  app.get("/admin/stats", async (c) => {
    if (!config.adminStatsToken) return c.json({ error: { code: "not_found", message: "Not found." } }, 404);
    const given = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
    if (!sameToken(given, config.adminStatsToken)) {
      return c.json({ error: { code: "unauthorized", message: "A valid admin token is required." } }, 401);
    }
    if (!deps.metricsStore) {
      return c.json({ error: { code: "metrics_disabled", message: "Counting is off on this server." } }, 503);
    }
    const range = statsRange(c.req.query("from"), c.req.query("to"), deps.now?.() ?? Date.now());
    if (!range) return c.json({ error: { code: "invalid_request", message: "from/to must be YYYY-MM-DD, from ≤ to, at most 366 days." } }, 400);
    try {
      return c.json(statsView(range.from, range.to, await deps.metricsStore.rows(range.from, range.to)));
    } catch (err) {
      logger.error({ msg: "stats failed", ...describe(err) });
      return c.json({ error: { code: "metrics_unavailable", message: "The counts can't be read right now." } }, 503);
    }
  });

  // Everything below needs the invite code, when INVITE_CODES is set.
  app.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS" || !config.inviteCodes) return next();
    const code = c.req.header("x-invite-code")?.trim();
    if (!code || !config.inviteCodes.has(code)) return failCounted(c, 401, "invite_required");
    return next();
  });

  app.get("/cases", (c) =>
    c.json({ cases: [...cases.values()].map(publicSummary) }),
  );

  /** 429 with Retry-After when this caller (invite code, else IP) is over the limit. */
  function rateLimited(c: Context, l: FixedWindowLimiter): Response | null {
    const key = config.inviteCodes ? `invite:${c.req.header("x-invite-code")?.trim()}` : `ip:${clientIp(c)}`;
    const retryAfter = l.take(key);
    if (!retryAfter) return null;
    c.header("Retry-After", String(retryAfter));
    return failCounted(c, 429, "rate_limited");
  }

  /** The body, parsed and validated; or the 400 to send back. */
  async function readJson<T>(c: Context, schema: z.ZodType<T>): Promise<T | Response> {
    const read = await readBody(c.req.raw);
    if (read.tooLarge) {
      // Drained: the keep-alive connection stays usable. Not drained: close it.
      if (!read.drained) c.header("Connection", "close");
      return failCounted(c, 400, "invalid_request", "The request body is too large.");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(read.text);
    } catch {
      raw = undefined;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return failCounted(c, 400, "invalid_request", parsed.error.issues[0]?.message ?? MESSAGES.invalid_request);
    return parsed.data;
  }

  function streamingRoute(path: string, role: Role, schema: typeof ChatBody | typeof SupervisionBody, build: typeof clientRequest) {
    app.post(
      path,
      async (c) => {
        const limited = rateLimited(c, limiter);
        if (limited) return limited;
        const body = await readJson(c, schema as z.ZodType<z.infer<typeof SupervisionBody>>);
        if (body instanceof Response) return body;
        const { caseId, locale, messages, durationSec } = body;
        // /supervision only: "live" is mid-session notes, a different prompt and different counts.
        const live = role === "supervisor" && (body as { mode?: string }).mode === "live";

        const theCase = cases.get(caseId);
        if (!theCase) return failCounted(c, 404, "case_not_found");

        const provider = providerFor(role);
        if (typeof provider === "string") {
          logger.error({ msg: "model unavailable", route: path, reason: provider });
          return failCounted(c, 503, "model_unavailable");
        }

        const request = (live ? liveSupervisorRequest : build)(prompts, theCase, locale, messages);
        // What we count when the stream ends (aborted streams aren't counted). /chat is stateless,
        // so a session "starts" with the turn that answers the counselor's first line.
        const at = { caseId: theCase.id, locale };
        const counselorLines = messages.filter((m) => m.role === "counselor").length;
        const onDone = (o: { ok: boolean; sessionEnd: boolean }) => {
          if (role === "client") {
            if (o.ok) {
              counter.count({ metric: "chat_turn", ...at });
              if (counselorLines === 1) counter.count({ metric: "session_started", ...at });
              if (o.sessionEnd) counter.count({ metric: "session_ended_by_client", ...at });
            }
          } else if (live) {
            // Mid-session notes: no report counts, no duration; a failure is only a stream_error.
            if (o.ok) counter.count({ metric: "live_supervision", ...at, dim: turnBucket(messages.length) });
          } else if (o.ok) {
            counter.count({ metric: "report_generated", ...at, dim: turnBucket(messages.length), durationSec });
            if (durationSec !== undefined) counter.count({ metric: "session_duration", ...at, dim: durationBucket(durationSec) });
          } else {
            counter.count({ metric: "report_failed", ...at });
          }
          if (!o.ok) counter.count({ metric: "error", dim: "stream_error" });
        };
        return streamTurn(c, { path, caseId, locale, count: messages.length, provider, request, onDone });
      },
    );
  }

  function streamTurn(
    c: Context,
    t: {
      path: string;
      caseId: string;
      locale: Locale;
      count: number;
      provider: ModelProvider;
      request: Omit<ModelRequest, "signal">;
      /** After the last frame is queued; never for an aborted stream. */
      onDone?: (o: { ok: boolean; sessionEnd: boolean }) => void;
    },
  ) {
    // Tell proxies (and Vercel) not to buffer or transform the stream.
    c.header("Cache-Control", "no-cache, no-transform");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      const started = Date.now();
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      c.req.raw.signal?.addEventListener("abort", () => abort.abort(), { once: true });

      // Writes go out in order; once the client is gone they fail quietly.
      let chain: Promise<unknown> = Promise.resolve();
      const send = (event: StreamEvent) => {
        chain = chain.then(() => stream.writeSSE({ data: JSON.stringify(event) })).catch(() => {});
      };
      const ping = setInterval(() => {
        chain = chain.then(() => stream.write(": ping\n\n")).catch(() => {});
      }, pingMs);

      const log = { route: t.path, caseId: t.caseId, locale: t.locale, messages: t.count, provider: t.provider.name, model: t.provider.model };
      send({ type: "turn_start" });
      try {
        let said = "";
        const res = await t.provider.stream(
          { ...t.request, signal: abort.signal },
          {
            onText: (text) => {
              if (!text) return;
              said += text;
              send({ type: "text_delta", text });
            },
          },
        );
        const saidSomething = said.trim() !== "";
        // The AI client ends the session by calling end_session (only /chat offers the tool).
        // The tool call itself never reaches the app: it becomes one session_end frame.
        const sessionEnd = t.request.tools.length > 0 && endsSession(res.message.toolCalls);
        if (sessionEnd) {
          // Some models call the tool without saying goodbye; the app still needs a last line.
          if (!saidSomething) send({ type: "text_delta", text: FAREWELL[t.locale] });
          send({ type: "session_end" });
        } else if (!saidSomething) {
          // Nothing to show (e.g. only an unknown tool call): let the app offer a retry.
          throw new EmptyReplyError(res.stopReason);
        }
        send({ type: "turn_end", usage: { inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens } });
        t.onDone?.({ ok: true, sessionEnd });
        logger.info({
          ...log,
          msg: "turn",
          stop: res.stopReason,
          ...(sessionEnd ? { sessionEnd: true } : {}),
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          ms: Date.now() - started,
        });
      } catch (err) {
        if (abort.signal.aborted) {
          logger.info({ ...log, msg: "turn aborted", ms: Date.now() - started });
        } else {
          logger.error({
            ...log,
            msg: "turn failed",
            ...describe(err),
            ...(err instanceof EmptyReplyError ? { stop: err.stop } : {}),
            ms: Date.now() - started,
          });
          send({ type: "error", code: "model_unavailable", message: MESSAGES.model_unavailable });
          t.onDone?.({ ok: false, sessionEnd: false });
        }
      } finally {
        clearInterval(ping);
        await chain;
      }
    });
  }

  /**
   * Forwards to the team's Slack channel and answers 204 either way: delivery is best effort and
   * the app never waits on Slack's mood. `log` carries only ids, enums and lengths, never text.
   */
  async function forwardToSlack(c: Context, kind: "feedback" | "report", log: Record<string, unknown>, message: unknown) {
    if (!config.feedbackWebhookUrl) {
      logger.info({ ...log, msg: `${kind} dropped: not configured` });
      return c.body(null, 204);
    }
    try {
      const status = await postToSlack(deps.fetch ?? fetch, config.feedbackWebhookUrl, message, deps.slackTimeoutMs);
      if (status >= 200 && status < 300) logger.info(log);
      else logger.error({ ...log, msg: `${kind} dropped: slack error`, status });
    } catch (err) {
      logger.error({ ...log, msg: `${kind} dropped: slack error`, ...describe(err) });
    }
    return c.body(null, 204);
  }

  const now = () => new Date(deps.now?.() ?? Date.now());
  const chars = (s: string | undefined) => [...(s ?? "")].length;

  // POST /feedback → 204: a rating of a report. Never conversation text.
  app.post("/feedback", async (c) => {
    const limited = rateLimited(c, feedbackLimiter);
    if (limited) return limited;
    const body = await readJson(c, FeedbackBody);
    if (body instanceof Response) return body;
    if (!cases.has(body.caseId)) return failCounted(c, 404, "case_not_found");
    counter.count({ metric: "feedback", caseId: body.caseId, locale: body.locale, dim: body.rating });
    const log = { msg: "feedback", caseId: body.caseId, locale: body.locale, rating: body.rating, commentChars: chars(body.comment) };
    return forwardToSlack(c, "feedback", log, slackMessage(body, now()));
  });

  // POST /report → 204: one reported passage, the only conversation text we pass on (to Slack).
  app.post("/report", async (c) => {
    const limited = rateLimited(c, reportLimiter);
    if (limited) return limited;
    const body = await readJson(c, ReportBody);
    if (body instanceof Response) return body;
    if (!cases.has(body.caseId)) return failCounted(c, 404, "case_not_found");
    counter.count({ metric: "user_report", caseId: body.caseId, locale: body.locale, dim: body.reason });
    const log = {
      msg: "report",
      caseId: body.caseId,
      locale: body.locale,
      source: body.source,
      reason: body.reason,
      reportedChars: chars(body.reportedText),
      commentChars: chars(body.comment),
    };
    return forwardToSlack(c, "report", log, reportSlackMessage(body, now()));
  });

  streamingRoute("/chat", "client", ChatBody, clientRequest);
  streamingRoute("/supervision", "supervisor", SupervisionBody, supervisorRequest);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found." } }, 404));
  app.onError((err, c) => {
    counter.count({ metric: "error", dim: "internal" });
    logger.error({ msg: "unhandled", route: c.req.path, ...describe(err) });
    return c.json({ error: { code: "internal", message: "Something went wrong on our side." } }, 500);
  });

  return app;
}
