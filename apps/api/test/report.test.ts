import { describe, expect, it } from "vitest";

import { createApp, type Logger } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import { SLACK_TEXT_MAX, fitSlack, type FetchLike } from "../src/feedback.js";
import { REPORT_REASONS } from "../src/report.js";

const cases = loadCases();
const prompts = loadPrompts();
const CASE_ID = [...cases.keys()][0]!;
const HOOK = "https://hooks.slack.com/services/T000/B000/XXXX";
const REPORTED = "这是被举报的那一条来访者回复 @here <!channel> https://example.com";
const NOTE = "这条说明也不该进日志";

type Block = { type: string; text?: { type: string; text: string }; fields?: { type: string; text: string }[] };
type Sent = { url: string; body: { text: string; blocks: Block[] } };

function makeApp(env: Record<string, string> = {}, slack: FetchLike = async () => new Response("ok"), slackTimeoutMs?: number) {
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
    ...(slackTimeoutMs ? { slackTimeoutMs } : {}),
  });
  return { app, lines, sent };
}

const send = (app: ReturnType<typeof makeApp>["app"], body: unknown, headers: Record<string, string> = {}) =>
  app.request("/report", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const ok = { caseId: CASE_ID, locale: "zh", source: "client_reply", reason: "harmful", reportedText: "你这样说让我很不舒服。" };

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
}

/** No reported text, no note, no webhook URL in the log. */
function expectCleanLog(lines: Record<string, unknown>[]) {
  const all = JSON.stringify(lines);
  for (const bit of ["被举报的那一条", "不该进日志", "你这样说", "hooks.slack.com"]) expect(all).not.toContain(bit);
}

describe("POST /report: validation", () => {
  it.each([
    ["not JSON", "nope"],
    ["missing reportedText", { ...ok, reportedText: undefined }],
    ["empty reportedText", { ...ok, reportedText: "  " }],
    ["reportedText over 2000 characters", { ...ok, reportedText: "长".repeat(2001) }],
    ["unknown reason", { ...ok, reason: "boring" }],
    ["unknown source", { ...ok, source: "counselor" }],
    ["unknown locale", { ...ok, locale: "fr" }],
    ["missing caseId", { ...ok, caseId: undefined }],
    ["comment over 500 characters", { ...ok, comment: "长".repeat(501) }],
    ["the rest of the session riding along", { ...ok, messages: [{ role: "counselor", text: "hi" }] }],
    ["a rating riding along", { ...ok, rating: "down" }],
  ])("%s → 400 invalid_request", async (_, body) => {
    const { app, sent } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    await expectError(await send(app, body), 400, "invalid_request");
    expect(sent).toHaveLength(0);
  });

  it("every reason and source the app uses is accepted; the limits are inclusive", async () => {
    const { app } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    for (const reason of REPORT_REASONS) for (const source of ["client_reply", "report"]) {
      expect((await send(app, { ...ok, reason, source })).status, `${reason}/${source}`).toBe(204);
    }
    expect((await send(app, { ...ok, reportedText: "长".repeat(2000), comment: "长".repeat(500) })).status).toBe(204);
  });

  it("unknown case → 404 case_not_found", async () => {
    const { app } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    await expectError(await send(app, { ...ok, caseId: "nope" }), 404, "case_not_found");
  });
});

describe("POST /report: delivery", () => {
  it("not configured → 204, dropped, log has lengths only", async () => {
    const { app, lines, sent } = makeApp();
    const res = await send(app, { ...ok, reportedText: REPORTED, comment: NOTE });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(sent).toHaveLength(0);
    expect(lines.filter((l) => l.msg === "report dropped: not configured")).toEqual([
      {
        msg: "report dropped: not configured",
        caseId: CASE_ID,
        locale: "zh",
        source: "client_reply",
        reason: "harmful",
        reportedChars: [...REPORTED].length,
        commentChars: [...NOTE].length,
      },
    ]);
    expectCleanLog(lines);
  });

  it("configured → one card marked as a report; text and note as plain_text only", async () => {
    const { app, lines, sent } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    expect((await send(app, { ...ok, locale: "en", source: "report", reason: "unsafe_advice", reportedText: REPORTED, comment: NOTE })).status).toBe(204);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(HOOK);
    const { text, blocks } = sent[0]!.body;
    expect(text).toMatch(/^🚩 Report/);
    expect(blocks[0]).toEqual({ type: "header", text: { type: "plain_text", text: "🚩 Report / 举报", emoji: true } });
    const parts = blocks.flatMap((b) => [...(b.text ? [b.text] : []), ...(b.fields ?? [])]);
    const all = JSON.stringify(parts);
    for (const bit of [CASE_ID, "en", "Supervision report", "Unsafe or inappropriate advice", "2026-10-17T09:30:00.000Z"]) expect(all).toContain(bit);
    // The reported text and the note: verbatim, plain_text, nowhere in mrkdwn or the fallback text.
    expect(parts.filter((p) => p.text === REPORTED)).toEqual([{ type: "plain_text", text: REPORTED, emoji: false }]);
    expect(parts.filter((p) => p.text === NOTE)).toEqual([{ type: "plain_text", text: NOTE, emoji: false }]);
    for (const p of parts.filter((p) => p.type === "mrkdwn")) {
      for (const bit of ["@here", "<!channel>", "example.com", "被举报", "不该进日志"]) expect(p.text).not.toContain(bit);
    }
    expect(text).not.toContain("被举报");
    expect(lines.filter((l) => l.msg === "report")).toHaveLength(1);
    expectCleanLog(lines);
  });

  it("no note is fine", async () => {
    const { app, sent } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    expect((await send(app, ok)).status).toBe(204);
    expect(JSON.stringify(sent[0]!.body)).toContain("(no note)");
  });

  it.each([
    ["Slack answers 500", async () => new Response("no", { status: 500 })],
    ["Slack is unreachable", async () => Promise.reject(new TypeError("fetch failed"))],
  ] as [string, FetchLike][])("%s → still 204, dropped, clean log", async (_, slack) => {
    const { app, lines } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK }, slack);
    expect((await send(app, { ...ok, reportedText: REPORTED, comment: NOTE })).status).toBe(204);
    expect(lines.some((l) => l.msg === "report dropped: slack error")).toBe(true);
    expectCleanLog(lines);
  });

  it("Slack never answering → times out, still 204, dropped", async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }));
    const { app, lines } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK }, hang, 20);
    const started = Date.now();
    expect((await send(app, { ...ok, reportedText: REPORTED })).status).toBe(204);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(lines.find((l) => l.msg === "report dropped: slack error")?.error).toMatch(/TimeoutError|DOMException/);
    expectCleanLog(lines);
  });
});

describe("POST /report: access", () => {
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
    // Feedback and chat keep their own quotas.
    const fb = await app.request("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ip },
      body: JSON.stringify({ caseId: CASE_ID, locale: "zh", rating: "up" }),
    });
    expect(fb.status).toBe(204);
    const chat = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ip },
      body: JSON.stringify({ caseId: CASE_ID, locale: "zh", messages: [{ role: "counselor", text: "你好" }] }),
    });
    expect(chat.status).toBe(200);
    await chat.text();
  });
});

describe("Slack's 3000-character section limit", () => {
  it("2000 emoji (4000 UTF-16 units) are cut to fit, marked, never splitting an emoji", async () => {
    const { app, sent } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    const emoji = "😀".repeat(2000);
    expect((await send(app, { ...ok, reportedText: emoji })).status).toBe(204);
    const plain = sent[0]!.body.blocks.flatMap((b) => (b.text?.type === "plain_text" ? [b.text.text] : []));
    const text = plain.find((t) => t.startsWith("😀"))!;
    expect(text.length).toBeLessThanOrEqual(SLACK_TEXT_MAX);
    expect(text.endsWith("…（已截断）")).toBe(true);
    const body = text.slice(0, -"…（已截断）".length);
    expect(body).toBe("😀".repeat(body.length / 2)); // whole emoji only, no lone surrogate
    // Every block stays under Slack's limit.
    for (const b of sent[0]!.body.blocks) if (b.text) expect(b.text.text.length).toBeLessThanOrEqual(3000);
  });

  it("2000 CJK characters fit as they are", async () => {
    const { app, sent } = makeApp({ FEEDBACK_SLACK_WEBHOOK_URL: HOOK });
    const text = "长".repeat(2000);
    expect((await send(app, { ...ok, reportedText: text })).status).toBe(204);
    expect(JSON.stringify(sent[0]!.body)).toContain(text);
    expect(JSON.stringify(sent[0]!.body)).not.toContain("已截断");
  });

  it("fitSlack keeps a surrogate pair whole at the cut", () => {
    const t = "a" + "😀".repeat(10); // the cut at an odd offset would land inside an emoji
    const out = fitSlack(t, 12);
    expect(out.endsWith("…（已截断）")).toBe(true);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out)).toBe(false);
    expect(out.length).toBeLessThanOrEqual(12);
  });
});
