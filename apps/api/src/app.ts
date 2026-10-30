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
import { staticContent, type ContentSource } from "./content-source.js";
import type { AdminLoader } from "./admin/types.js";
import { createProvider, type ModelProvider } from "./llm/index.js";
import { addUsage, type ModelRequest, type ModelResponse, type Usage } from "./llm/types.js";
import { FeedbackBody, postToSlack, slackMessage, type FetchLike } from "./feedback.js";
import type { Auth, AuthUser } from "./auth/types.js";
import { disabledCounter, durationBucket, normalizeEvent, turnBucket, type Counter, type MetricsStore } from "./metrics/counter.js";
import { ClosingHold, END_THRESHOLD, JUDGE_TIMEOUT_MS, NEUTRAL_LINE, REGENERATE_NOTE, harmfulCount, isClosing, judgeRequest } from "./end-judge.js";
import { EndTagFilter } from "./end-tag.js";
import { statsRange, statsView } from "./metrics/stats.js";
import { FixedWindowLimiter, clientIp } from "./rate-limit.js";
import { readBody } from "./read-body.js";
import { ReportBody, reportSlackMessage } from "./report.js";
import { ChatBody, SupervisionBody, type ErrorCode, type Locale, type Message, type StreamEvent } from "./schema.js";
import { FAREWELL, clientRequest, endsSession, liveSupervisorRequest, supervisorRequest } from "./session.js";
import { VOICE_ERROR_LINE, VOICE_NOTE, VoiceLlmBody, VoiceSessionBody, chunk, conversationToken, endCallDelta, lengthNote, turnLength, voiceTurn } from "./voice.js";

/** Keeps proxies from closing the stream while the model thinks. */
export const PING_MS = 15_000;
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
  /** 0..1. Tests fix how long a voice turn runs. Default: Math.random. */
  random?: () => number;
  /** Tests inject a fake Slack here. Default: global fetch. */
  fetch?: FetchLike;
  /** How long we wait for Slack. Default 5 s. */
  slackTimeoutMs?: number;
  /** Anonymous counts. Default: off. */
  counter?: Counter;
  /** Where GET /admin/stats reads from; null when counting is off. */
  metricsStore?: MetricsStore | null;
  /** END_SESSION_JUDGE: how long the check may take. Default JUDGE_TIMEOUT_MS. */
  judgeTimeoutMs?: number;
  pingMs?: number;
  /** Sign-in (AUTH_MODE=on); null or unset: off, invite codes as before. */
  auth?: Auth | null;
  /** CONTENT_SOURCE=db: the published versions. Unset: `cases` and `prompts.rubrics`, as always. */
  content?: ContentSource;
  /** ADMIN_MODE=on: builds the admin routes on the first /admin request. Unset: they don't exist. */
  admin?: AdminLoader | null;
}

const MESSAGES: Record<ErrorCode, string> = {
  invalid_request: "The request body is not valid.",
  invite_required: "An invite code is required.",
  case_not_found: "Unknown case.",
  rate_limited: "Too many requests. Please wait a moment.",
  model_unavailable: "The model is not available right now.",
  session_expired: "Your session has expired. Please sign in again.",
  update_required: "Please update the app.",
};

type Status = 400 | 401 | 404 | 426 | 429 | 503;
const fail = (c: Context, status: Status, code: ErrorCode, message = MESSAGES[code]) =>
  c.json({ error: { code, message } }, status);

/** Constant-time comparison for the admin token; hashing first hides its length too. */
function sameToken(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** The routes of docs/admin-api.md. */
const ADMIN_PATHS = /^\/admin\/(?:auth\/(?:google|logout)|me|dashboard|content(?:\/.*)?|publish-log)$/;

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
  const { config, prompts } = deps;
  const content = deps.content ?? staticContent({ cases: deps.cases, rubrics: prompts.rubrics, versions: new Map() });
  const logger = deps.logger ?? consoleLogger;
  const pingMs = deps.pingMs ?? PING_MS;
  const rawCounter = deps.counter ?? disabledCounter;
  // Every count goes through normalizeEvent: unknown case ids and languages become "unknown".
  const counter: Counter = { enabled: rawCounter.enabled, count: (e) => rawCounter.count(normalizeEvent(e, content.latest().cases)) };
  /**
   * The error answer, counted by its code only (no case, language, invite code or IP).
   * 401 and 429 are not counted: they come before or from the rate limit, so anyone could make
   * us write to the database without end.
   */
  const failCounted = (c: Context, status: Status, code: ErrorCode, message?: string) => {
    // Also not 401 session_expired or 426 update_required: they come before the rate limit too.
    if (!["invite_required", "rate_limited", "session_expired", "update_required"].includes(code)) counter.count({ metric: "error", dim: code });
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

  app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "X-Invite-Code", "Authorization"], exposeHeaders: ["Retry-After"] }));

  const nowMs = () => deps.now?.() ?? Date.now();
  const auth = deps.auth ?? null;
  /** The signed-in account of a request, set by the gate below. */
  const userOf = new WeakMap<Request, AuthUser>();
  /** The store reviewer's requests are never counted. */
  const isReviewer = (u: AuthUser | undefined) => u?.inviteBatch === "review";

  // With sign-in off, exactly {"ok":true} as before.
  app.get("/health", (c) => c.json(auth ? { ok: true, auth: auth.mode(nowMs()) } : { ok: true }));

  // /auth/*, /me, /admin/accounts/delete: sign-in's own routes, ahead of the gate. Off: 404.
  if (auth) app.route("/", auth.routes);
  else {
    const notFound = (c: Context) => c.json({ error: { code: "not_found", message: "Not found." } }, 404);
    app.all("/auth/*", notFound);
    app.all("/me", notFound);
  }

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
    // Finished days and weeks of active accounts first, so the view is up to date.
    if (auth) await auth.rollUp().catch((err) => logger.error({ msg: "active roll-up failed", ...describe(err) }));
    try {
      return c.json(statsView(range.from, range.to, await deps.metricsStore.rows(range.from, range.to)));
    } catch (err) {
      logger.error({ msg: "stats failed", ...describe(err) });
      return c.json({ error: { code: "metrics_unavailable", message: "The counts can't be read right now." } }, 503);
    }
  });

  // ADMIN_MODE=on: the admin's routes (docs/admin-api.md), loaded on the first request that needs
  // them, so serving the app never loads the admin code. /admin/stats above and
  // /admin/accounts/delete (sign-in's routes) answered already. Off: nothing here, as before.
  if (deps.admin) {
    const load = deps.admin;
    let routes: Promise<Hono> | null = null;
    app.all("/admin/*", (c, next) => {
      // Only the admin's own paths; any other /admin path goes on as before (the gate, then 404).
      if (!ADMIN_PATHS.test(c.req.path)) return next();
      routes ??= load({ content, previewTurn }).catch((err) => {
        routes = null;
        throw err;
      });
      return routes.then((r) => r.fetch(c.req.raw, c.env));
    });
  }

  /** The admin's preview chat: one /chat turn for a case that isn't published. Never counted. */
  function previewTurn(c: Context, theCase: Case, locale: Locale, messages: Message[]) {
    const provider = providerFor("client");
    if (typeof provider === "string") {
      logger.error({ msg: "model unavailable", route: "preview-chat", reason: provider });
      return fail(c, 503, "model_unavailable");
    }
    const request = clientRequest(prompts, theCase, locale, messages);
    const judge = config.endSessionJudge ? { messages } : undefined;
    return streamTurn(c, { path: "/admin/preview-chat", caseId: theCase.id, locale, count: messages.length, provider, request, judge });
  }

  // Voice sessions (docs/decisions/0013-voice-elevenlabs.md): the ElevenLabs agent's custom LLM.
  // ElevenLabs calls it, not the app, so it sits ahead of the gate with its own secret. Off: 404.
  // Both paths, because the agent's server URL may or may not end in /v1.
  for (const path of ["/voice/llm/chat/completions", "/voice/llm/v1/chat/completions"]) app.post(path, voiceLlmTurn);

  async function voiceLlmTurn(c: Context) {
    if (!config.voice) return c.json({ error: { code: "not_found", message: "Not found." } }, 404);
    const given = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
    if (!sameToken(given, config.voice.llmSecret)) return c.json({ error: { code: "unauthorized", message: "A valid secret is required." } }, 401);
    const body = await readJson(c, VoiceLlmBody);
    if (body instanceof Response) return body;
    const turn = voiceTurn(body);
    if (!turn) return failCounted(c, 400, "invalid_request", "No case or language: set the psygym dynamic variable or extra_body.");
    const snap = await content.current();
    const theCase = snap.cases.get(turn.caseId);
    if (!theCase) return failCounted(c, 404, "case_not_found");
    const provider = providerFor("client");
    if (typeof provider === "string") {
      logger.error({ msg: "model unavailable", route: "/voice/llm", reason: provider });
      return failCounted(c, 503, "model_unavailable");
    }
    const { locale } = turn;
    // The agent may ask for a reply before anyone spoke; the client then waits to be greeted.
    const messages: Message[] = turn.messages.length ? turn.messages : [{ role: "counselor", text: locale === "zh" ? "（会谈开始）" : "(The session begins.)" }];
    const base = clientRequest({ ...prompts, rubrics: snap.rubrics }, theCase, locale, messages);
    const at = { caseId: theCase.id, locale };
    const counselorLines = messages.filter((m) => m.role === "counselor").length;
    const target = turnLength(counselorLines, (deps.random ?? Math.random)());
    const note = lengthNote(locale, target, (deps.random ?? Math.random)());
    // At the very end: in the system prompt the model ignores it and copies its own last reply.
    const asked = base.messages.map((m, i) => (i === base.messages.length - 1 && m.role === "user" ? { ...m, text: `${m.text}\n\n${note}` } : m));
    const request = { ...base, system: `${base.system}\n\n${VOICE_NOTE[locale]}`, messages: asked };
    const log = { route: "/voice/llm", caseId: theCase.id, locale, messages: messages.length, provider: provider.name, model: provider.model };

    c.header("Cache-Control", "no-cache, no-transform");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      const started = Date.now();
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      const id = `chatcmpl-${started.toString(36)}`;
      const created = Math.floor(started / 1000);
      let chain: Promise<unknown> = Promise.resolve();
      const write = (data: string) => {
        chain = chain.then(() => stream.writeSSE({ data })).catch(() => {});
      };
      let said = "";
      const say = (text: string) => {
        if (!text) return;
        if (!said) write(chunk(id, created, provider.model, { role: "assistant", content: "" }));
        said += text;
        write(chunk(id, created, provider.model, { content: text }));
      };
      try {
        let sessionEnd: boolean;
        let usage: Usage;
        let judged: Record<string, unknown> = {};
        if (config.endSessionJudge) {
          const r = await judgedTurn(provider, request, locale, messages, abort.signal, say, () => said);
          ({ sessionEnd, usage, judged } = r);
        } else {
          const endTags = new EndTagFilter();
          const res = await provider.stream({ ...request, signal: abort.signal }, { onText: (text) => say(endTags.push(text)) });
          say(endTags.flush());
          usage = res.usage;
          sessionEnd = endsSession(res.message.toolCalls) || endTags.found;
        }
        // ElevenLabs drops a request when the trainee turns out not to be done. The model stream
        // can end quietly then: nothing was said, so nothing is counted.
        if (abort.signal.aborted) {
          logger.info({ ...log, msg: "turn aborted", ms: Date.now() - started });
          return;
        }
        if (sessionEnd && !said.trim()) say(FAREWELL[locale]);
        else if (!said.trim()) say(VOICE_ERROR_LINE[locale]);
        // The session ends in character: ElevenLabs speaks the closing line, then hangs up.
        const hangUp = sessionEnd && turn.canEndCall;
        if (hangUp) write(chunk(id, created, provider.model, endCallDelta(locale)));
        write(chunk(id, created, provider.model, {}, hangUp ? "tool_calls" : "stop"));
        write("[DONE]");
        counter.count({ metric: "chat_turn", ...at });
        if (counselorLines === 1) counter.count({ metric: "session_started", ...at });
        if (sessionEnd) counter.count({ metric: "session_ended_by_client", ...at });
        logger.info({ ...log, msg: "turn", ...(sessionEnd ? { sessionEnd: true } : {}), ...judged, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, ms: Date.now() - started });
      } catch (err) {
        if (abort.signal.aborted) {
          logger.info({ ...log, msg: "turn aborted", ms: Date.now() - started });
        } else {
          logger.error({ ...log, msg: "turn failed", ...describe(err), ms: Date.now() - started });
          // A spoken call can't show an error banner: the client asks to hear it again instead.
          if (!said.trim()) say(VOICE_ERROR_LINE[locale]);
          write(chunk(id, created, provider.model, {}, "stop"));
          write("[DONE]");
          counter.count({ metric: "error", dim: "stream_error" });
        }
      } finally {
        await chain;
      }
    });
  }

  // The gate for everything below. A request with Authorization is judged by its token alone.
  // Without a token: 426 once sign-in is required, else the invite code (when INVITE_CODES is set).
  app.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    if (auth) {
      const header = c.req.header("authorization");
      if (header !== undefined) {
        const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
        const user = token ? await auth.authenticate(token) : null;
        if (!user) return failCounted(c, 401, "session_expired");
        userOf.set(c.req.raw, user);
        countAuth(c, "session");
        return next();
      }
      if (auth.mode(nowMs()) === "required") return failCounted(c, 426, "update_required");
    }
    if (config.inviteCodes) {
      const code = c.req.header("x-invite-code")?.trim();
      if (!code || !config.inviteCodes.has(code)) return failCounted(c, 401, "invite_required");
    }
    if (auth) countAuth(c, "invite");
    return next();
  });

  /** With sign-in on: how each /chat turn came in, to see old apps fade out before "required". */
  function countAuth(c: Context, how: "session" | "invite") {
    if (isReviewer(userOf.get(c.req.raw))) return;
    if (c.req.method === "POST" && c.req.path === "/chat") counter.count({ metric: "auth", dim: how });
  }

  app.get("/cases", async (c) => c.json({ cases: [...(await content.current()).cases.values()].map(publicSummary) }));

  /** 429 with Retry-After when this caller (invite code, else IP) is over the limit. */
  function rateLimited(c: Context, l: FixedWindowLimiter): Response | null {
    const user = userOf.get(c.req.raw);
    const key = user ? `user:${user.id}` : config.inviteCodes ? `invite:${c.req.header("x-invite-code")?.trim()}` : `ip:${clientIp(c)}`;
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

        const snap = await content.current();
        const theCase = snap.cases.get(caseId);
        if (!theCase) return failCounted(c, 404, "case_not_found");

        const provider = providerFor(role);
        if (typeof provider === "string") {
          logger.error({ msg: "model unavailable", route: path, reason: provider });
          return failCounted(c, 503, "model_unavailable");
        }

        const request = (live ? liveSupervisorRequest : build)({ ...prompts, rubrics: snap.rubrics }, theCase, locale, messages);
        // What we count when the stream ends (aborted streams aren't counted). /chat is stateless,
        // so a session "starts" with the turn that answers the counselor's first line.
        const at = { caseId: theCase.id, locale };
        const counselorLines = messages.filter((m) => m.role === "counselor").length;
        const user = userOf.get(c.req.raw);
        const onDone = (o: { ok: boolean; sessionEnd: boolean }) => {
          if (isReviewer(user)) return; // the store reviewer is never counted
          // A /chat or /supervision (either mode) that ended well makes the account active today.
          if (o.ok && user && auth) auth.markActive(user);
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
        // END_SESSION_JUDGE (src/end-judge.ts): /chat only. Off: no judge, the stream as it always was.
        const judge = role === "client" && config.endSessionJudge ? { messages } : undefined;
        const caseVersion = snap.versions.get(`case:${caseId}`);
        return streamTurn(c, { path, caseId, caseVersion, locale, count: messages.length, provider, request, onDone, judge });
      },
    );
  }

  function streamTurn(
    c: Context,
    t: {
      path: string;
      caseId: string;
      /** CONTENT_SOURCE=db: the published version used; logged. */
      caseVersion?: number;
      locale: Locale;
      count: number;
      provider: ModelProvider;
      request: Omit<ModelRequest, "signal">;
      /** After the last frame is queued; never for an aborted stream. */
      onDone?: (o: { ok: boolean; sessionEnd: boolean }) => void;
      /** Set only with END_SESSION_JUDGE on, for /chat. */
      judge?: { messages: Message[] };
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
      // A request already cancelled never fires "abort". Only on the judged path, so the default
      // stream stays exactly as it was.
      if (t.judge && c.req.raw.signal?.aborted) abort.abort();

      // Writes go out in order; once the client is gone they fail quietly.
      let chain: Promise<unknown> = Promise.resolve();
      const send = (event: StreamEvent) => {
        chain = chain.then(() => stream.writeSSE({ data: JSON.stringify(event) })).catch(() => {});
      };
      const ping = setInterval(() => {
        chain = chain.then(() => stream.write(": ping\n\n")).catch(() => {});
      }, pingMs);

      const log = { route: t.path, caseId: t.caseId, ...(t.caseVersion !== undefined ? { caseVersion: t.caseVersion } : {}), locale: t.locale, messages: t.count, provider: t.provider.name, model: t.provider.model };
      send({ type: "turn_start" });
      try {
        let said = "";
        const say = (text: string) => {
          if (!text) return;
          said += text;
          send({ type: "text_delta", text });
        };
        let res: ModelResponse;
        let usage: Usage;
        let endTagInText: boolean;
        let sessionEnd: boolean;
        let judged: Record<string, unknown> = {};
        if (!t.judge) {
          // Only /chat offers the tool, so only there can its call show up as text.
          const endTags = t.request.tools.length > 0 ? new EndTagFilter() : undefined;
          res = await t.provider.stream(
            { ...t.request, signal: abort.signal },
            { onText: (text) => say(endTags ? endTags.push(text) : text) },
          );
          if (endTags) say(endTags.flush());
          usage = res.usage;
          // The AI client ends the session by calling end_session (only /chat offers the tool).
          // The tool call itself never reaches the app: it becomes one session_end frame. A call
          // written into the text as a tag counts the same (src/end-tag.ts).
          endTagInText = endTags?.found === true;
          sessionEnd = t.request.tools.length > 0 && (endsSession(res.message.toolCalls) || endTagInText);
        } else {
          ({ res, usage, endTagInText, sessionEnd, judged } = await judgedTurn(t.provider, t.request, t.locale, t.judge.messages, abort.signal, say, () => said));
        }
        const saidSomething = said.trim() !== "";
        if (sessionEnd) {
          // Some models call the tool without saying goodbye; the app still needs a last line.
          if (!saidSomething) send({ type: "text_delta", text: FAREWELL[t.locale] });
          send({ type: "session_end" });
        } else if (!saidSomething) {
          // Nothing to show (e.g. only an unknown tool call): let the app offer a retry.
          throw new EmptyReplyError(res.stopReason);
        }
        send({ type: "turn_end", usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } });
        t.onDone?.({ ok: true, sessionEnd });
        logger.info({
          ...log,
          msg: "turn",
          stop: res.stopReason,
          ...(sessionEnd ? { sessionEnd: true } : {}),
          ...(endTagInText ? { endTagInText: true } : {}),
          ...judged,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
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
   * One /chat turn with END_SESSION_JUDGE on (src/end-judge.ts). Finished sentences go out as they
   * come; from the first one that reads like a closing line, the rest is held. An end_session call
   * (or tag) ends the session only when the check finds END_THRESHOLD harmful counselor messages.
   * Otherwise the held closing line is dropped; if nothing else was said, the client is asked once
   * more, without the tool. `judged` goes to the log: no text, only outcomes and token counts.
   */
  async function judgedTurn(
    provider: ModelProvider,
    request: Omit<ModelRequest, "signal">,
    locale: Locale,
    messages: Message[],
    signal: AbortSignal,
    say: (text: string) => void,
    said: () => string,
  ): Promise<{ res: ModelResponse; usage: Usage; endTagInText: boolean; sessionEnd: boolean; judged: Record<string, unknown> }> {
    const endTags = new EndTagFilter();
    const hold = new ClosingHold();
    const res = await provider.stream({ ...request, signal }, { onText: (text) => say(hold.push(endTags.push(text))) });
    say(hold.push(endTags.flush()));
    const endTagInText = endTags.found;
    const wantsEnd = endsSession(res.message.toolCalls) || endTagInText;
    const { rest, closing } = hold.finish();
    if (!wantsEnd) {
      say(rest + closing);
      return { res, usage: res.usage, endTagInText, sessionEnd: false, judged: {} };
    }

    const verdict = await checkEnd(locale, messages, signal);
    const judged: Record<string, unknown> = {
      endJudge: verdict.outcome,
      ...(verdict.count !== undefined ? { harmfulCount: verdict.count } : {}),
      ...(verdict.usage ? { judgeInputTokens: verdict.usage.inputTokens, judgeOutputTokens: verdict.usage.outputTokens } : {}),
    };
    if (verdict.outcome === "confirmed") {
      say(rest + closing);
      return { res, usage: res.usage, endTagInText, sessionEnd: true, judged };
    }

    // Not confirmed: the closing line never goes out; what came before it does.
    say(rest);
    // No closing line was held: it didn't read like one and went out already (logged as "late").
    if (!closing) judged.late = true;
    if (said().trim() !== "") return { res, usage: res.usage, endTagInText, sessionEnd: false, judged };

    // Nothing to show: ask once more, without the tool. The answer is held whole and checked: a
    // closing line or tag there too gives way to a neutral line.
    let usage = res.usage;
    let again = "";
    try {
      const retryTags = new EndTagFilter();
      const r = await provider.stream(
        { ...request, system: `${request.system}\n\n${REGENERATE_NOTE[locale]}`, tools: [], signal },
        { onText: (text) => void (again += retryTags.push(text)) },
      );
      again += retryTags.flush();
      usage = addUsage(usage, r.usage);
      if (retryTags.found || isClosing(again)) {
        judged.retryClosing = true;
        again = "";
      }
    } catch (err) {
      if (signal.aborted) throw err;
      logger.error({ msg: "end judge: second try failed", ...describe(err) });
      again = "";
    }
    say(again.trim() ? again : NEUTRAL_LINE[locale]);
    return { res, usage, endTagInText, sessionEnd: false, judged: { ...judged, regenerated: true } };
  }

  /** The independent check. Any failure, or no answer within the timeout, is "error": no end. */
  async function checkEnd(
    locale: Locale,
    messages: Message[],
    signal: AbortSignal,
  ): Promise<{ outcome: "confirmed" | "rejected" | "error"; count?: number; usage?: Usage }> {
    const judge = providerFor("supervisor");
    if (typeof judge === "string") return { outcome: "error" };
    const timeout = new AbortController();
    const onAbort = () => timeout.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timeout.abort();
          reject(new Error("end judge timed out"));
        }, deps.judgeTimeoutMs ?? JUDGE_TIMEOUT_MS);
      });
      const r = await Promise.race([judge.stream({ ...judgeRequest(prompts, locale, messages), signal: timeout.signal }, {}), expired]);
      const count = harmfulCount(r.message.text, messages);
      return { outcome: count >= END_THRESHOLD ? "confirmed" : "rejected", count, usage: r.usage };
    } catch (err) {
      if (signal.aborted) throw err;
      logger.error({ msg: "end judge failed", ...describe(err) });
      return { outcome: "error" };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
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
  // GET /voice/status: whether the app shows "Voice session". Off (no voice config): 404.
  app.get("/voice/status", (c) => {
    if (!config.voice) return c.json({ error: { code: "not_found", message: "Not found." } }, 404);
    return c.json({ available: true });
  });

  // POST /voice/session: a conversation token for the ElevenLabs agent, and what the app passes
  // when it starts the call. Behind the gate like /chat. Off (no voice config): 404.
  app.post("/voice/session", async (c) => {
    if (!config.voice) return c.json({ error: { code: "not_found", message: "Not found." } }, 404);
    const limited = rateLimited(c, limiter);
    if (limited) return limited;
    const body = await readJson(c, VoiceSessionBody);
    if (body instanceof Response) return body;
    const snap = await content.current();
    if (!snap.cases.has(body.caseId)) return failCounted(c, 404, "case_not_found");
    try {
      const token = await conversationToken(deps.fetch ?? fetch, config.voice.apiKey, config.voice.agentId);
      return c.json({
        conversationToken: token,
        dynamicVariables: { psygym: `case=${body.caseId} locale=${body.locale}` },
        extraBody: { caseId: body.caseId, locale: body.locale },
      });
    } catch (err) {
      logger.error({ msg: "voice token failed", ...describe(err) });
      return failCounted(c, 503, "model_unavailable", "Voice is not available right now.");
    }
  });

  app.post("/feedback", async (c) => {
    const limited = rateLimited(c, feedbackLimiter);
    if (limited) return limited;
    const body = await readJson(c, FeedbackBody);
    if (body instanceof Response) return body;
    if (!(await content.current()).cases.has(body.caseId)) return failCounted(c, 404, "case_not_found");
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
    if (!(await content.current()).cases.has(body.caseId)) return failCounted(c, 404, "case_not_found");
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
