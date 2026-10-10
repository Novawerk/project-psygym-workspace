import { describe, expect, it } from "vitest";

import { createApp, type Logger } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import type { FetchLike } from "../src/feedback.js";

const cases = loadCases();
const prompts = loadPrompts();
const CASE_ID = [...cases.keys()][0]!;
const HOOK = "https://hooks.slack.com/services/T000/B000/XXXX";
const SECRET = "这条评论不该出现在日志里 <!channel>";

type Sent = { url: string; body: { text: string; blocks: { fields?: { text: string }[]; text?: { text: string } }[] } };

function makeApp(env: Record<string, string> = {}, slack: (url: string, init: RequestInit) => Promise<Response> = async () => new Response("ok")) {
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const sent: Sent[] = [];
  const fetch: FetchLike = async (url, init) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return slack(url, init);
  };
  const app = createApp({
    config: loadConfig({ LLM_PROVIDER: "mock", ...env }),
    cases,
    prompts,
    logger,
    fetch,
    now: () => Date.UTC(2026, 9, 17, 9, 30),
  });
  return { app, lines, sent };
}

const send = (app: ReturnType<typeof makeApp>["app"], body: unknown, headers: Record<string, string> = {}) =>
  app.request("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const ok = { caseId: CASE_ID, locale: "zh", rating: "up" };

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
}

describe("POST /feedback: validation", () => {
  it.each([
    ["not JSON", "nope"],
    ["missing rating", { caseId: CASE_ID, locale: "zh" }],
    ["unknown rating", { ...ok, rating: "meh" }],
    ["unknown locale", { ...ok, locale: "fr" }],
    ["missing caseId", { locale: "zh", rating: "up" }],
    ["comment not a string", { ...ok, comment: 3 }],
    ["comment over 500 characters", { ...ok, comment: "长".repeat(501) }],
    ["a conversation riding along", { ...ok, messages: [{ role: "counselor", text: "hi" }] }],
  ])("%s → 400 invalid_request", async (_, body) => {
    const { app, sent } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    await expectError(await send(app, body), 400, "invalid_request");
    expect(sent).toHaveLength(0);
  });

  it("500 CJK characters (or an emoji-heavy comment) is fine", async () => {
    const { app } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    expect((await send(app, { ...ok, comment: "长".repeat(500) })).status).toBe(204);
    expect((await send(app, { ...ok, comment: "👍".repeat(500) })).status).toBe(204);
  });

  it("unknown case → 404 case_not_found", async () => {
    const { app } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    await expectError(await send(app, { ...ok, caseId: "nope" }), 404, "case_not_found");
  });
});

describe("POST /feedback: delivery", () => {
  it("not configured → 204, dropped, one log line without the comment", async () => {
    const { app, lines, sent } = makeApp();
    const res = await send(app, { ...ok, comment: SECRET });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(sent).toHaveLength(0);
    expect(lines.filter((l) => l.msg === "feedback dropped: not configured")).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain("这条评论");
  });

  it("configured → posts case, language, rating, comment and time to Slack; log has no comment", async () => {
    const { app, lines, sent } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    expect((await send(app, { ...ok, locale: "en", rating: "down", comment: SECRET })).status).toBe(204);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(HOOK);
    const all = JSON.stringify(sent[0]!.body);
    expect(all).toContain(CASE_ID);
    expect(all).toContain("en");
    expect(all).toContain("👎 down");
    expect(all).toContain("2026-10-17T09:30:00.000Z");
    // The comment is there, as text: Slack markup is escaped, so <!channel> pings no one.
    expect(all).toContain("这条评论不该出现在日志里 &lt;!channel&gt;");
    expect(all).not.toContain("<!channel>");
    expect(lines.filter((l) => String(l.msg).startsWith("feedback"))).toEqual([{ msg: "feedback", caseId: CASE_ID, locale: "en", rating: "down", commentChars: [...SECRET].length }]);
    expect(JSON.stringify(lines)).not.toContain("这条评论");
  });

  it("no comment is fine", async () => {
    const { app, sent } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    expect((await send(app, ok)).status).toBe(204);
    expect(JSON.stringify(sent[0]!.body)).toContain("no comment");
  });

  it.each([
    ["Slack answers 500", async () => new Response("no", { status: 500 })],
    ["Slack is unreachable", async () => Promise.reject(new TypeError("fetch failed"))],
  ])("%s → still 204, error logged without the comment or the webhook", async (_, slack) => {
    const { app, lines } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK }, slack);
    expect((await send(app, { ...ok, comment: SECRET })).status).toBe(204);
    expect(lines.some((l) => l.msg === "feedback dropped: slack error")).toBe(true);
    expect(JSON.stringify(lines)).not.toContain("这条评论");
    expect(JSON.stringify(lines)).not.toContain("hooks.slack.com");
  });

  it("a webhook that isn't https is a config error, and feedback is dropped", async () => {
    const { app, lines, sent } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: "http://example.com/hook" });
    expect((await send(app, ok)).status).toBe(204);
    expect(sent).toHaveLength(0);
    expect(lines.some((l) => l.msg === "config error" && String(l.error).startsWith("FEEDBACK_SLACK_WEBHOOK_URL"))).toBe(true);
    expect(JSON.stringify(lines)).not.toContain("example.com");
  });
});

describe("POST /feedback: access", () => {
  it("401 invite_required when invite codes are on", async () => {
    const { app } = makeApp({ INVITE_CODES: "alpha" });
    await expectError(await send(app, ok), 401, "invite_required");
    await expectError(await send(app, ok, { "X-Invite-Code": "beta" }), 401, "invite_required");
    expect((await send(app, ok, { "X-Invite-Code": "alpha" })).status).toBe(204);
  });

  it("429 rate_limited with Retry-After, in its own bucket", async () => {
    const { app } = makeApp({ RATE_LIMIT_MAX: "2" });
    const ip = { "X-Forwarded-For": "1.2.3.4" };
    expect((await send(app, ok, ip)).status).toBe(204);
    expect((await send(app, ok, ip)).status).toBe(204);
    const limited = await send(app, ok, ip);
    await expectError(limited, 429, "rate_limited");
    expect(limited.headers.get("retry-after")).toBe("60");
    // Chat still has its own quota.
    const chat = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ip },
      body: JSON.stringify({ caseId: CASE_ID, locale: "zh", messages: [{ role: "counselor", text: "你好" }] }),
    });
    expect(chat.status).toBe(200);
    await chat.text();
  });
});
