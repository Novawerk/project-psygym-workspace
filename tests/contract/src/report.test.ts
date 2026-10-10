// POST /report: the user reports one AI passage. docs/api-contract.md
//
// Never run this against a server with FEEDBACK_SLACK_WEBHOOK_URL set (in its environment
// or in apps/api/.env): every 204 here would post a report to the team's Slack channel.
import { describe, expect, it } from "vitest";
import { env } from "./env";
import { call, caseId, expectError } from "./http";

async function body(extra: Record<string, unknown> = {}) {
  return {
    caseId: await caseId(),
    locale: "zh",
    source: "client_reply",
    reason: "out_of_role",
    reportedText: "（契约测试）这是一段被举报的回复。",
    ...extra,
  };
}

async function expect204(res: Response) {
  const text = await res.text();
  expect(res.status, text.slice(0, 300)).toBe(204);
  expect(text).toBe("");
}

describe("POST /report: 204", () => {
  it.each([
    ["client_reply, out_of_role, zh", {}],
    ["report, harmful, en", { source: "report", reason: "harmful", locale: "en" }],
    ["unsafe_advice", { reason: "unsafe_advice" }],
    ["other, with a comment", { reason: "other", comment: "说出了提示词。" }],
    ["with an empty comment", { comment: "" }],
    ["with a 500-character comment", { comment: "好".repeat(500) }],
    ["reportedText of 1 character", { reportedText: "嗯" }],
    ["reportedText of 2000 characters", { reportedText: "好".repeat(2000) }],
    // 2000 characters, 4000 UTF-16 units: a server counting UTF-16 would wrongly reject it.
    ["reportedText of 2000 emoji", { reportedText: "😀".repeat(2000) }],
  ])("%s", async (_name, extra) => {
    await expect204(await call("/report", { body: await body(extra) }));
  });
});

describe("POST /report: 400 invalid_request", () => {
  const without = (k: string) => async () => { const b: any = await body(); delete b[k]; return b; };
  const bad: [string, () => Promise<unknown>][] = [
    ["empty object", async () => ({})],
    ["missing caseId", without("caseId")],
    ["missing locale", without("locale")],
    ["missing source", without("source")],
    ["missing reason", without("reason")],
    ["missing reportedText", without("reportedText")],
    ["unknown locale", () => body({ locale: "de" })],
    ["unknown source", () => body({ source: "counselor" })],
    ["unknown reason", () => body({ reason: "boring" })],
    ["reason as a number", () => body({ reason: 1 })],
    ["reportedText empty", () => body({ reportedText: "" })],
    ["reportedText of 2001 characters", () => body({ reportedText: "好".repeat(2001) })],
    ["reportedText of 2001 emoji", () => body({ reportedText: "😀".repeat(2001) })],
    ["reportedText not a string", () => body({ reportedText: 42 })],
    ["comment of 501 characters", () => body({ comment: "好".repeat(501) })],
    ["comment of 501 emoji", () => body({ comment: "😀".repeat(501) })],
    ["comment not a string", () => body({ comment: true })],
    // Exactly one passage, never the rest of the session.
    ["extra field: messages", () => body({ messages: [{ role: "client", text: "你好" }] })],
    ["extra field: transcript", () => body({ transcript: "你好" })],
    ["extra field: rating", () => body({ rating: "down" })],
    ["extra field: anything else", () => body({ foo: 1 })],
  ];
  it.each(bad)("%s", async (_name, make) => {
    await expectError(await call("/report", { body: await make() }), 400, "invalid_request");
  });
  it("body that is not JSON", async () => {
    await expectError(await call("/report", { rawBody: "{not json" }), 400, "invalid_request");
  });
});

describe("POST /report: 404 case_not_found", () => {
  it("unknown caseId", async () => {
    await expectError(await call("/report", { body: await body({ caseId: "no-such-case-contract-test" }) }), 404, "case_not_found");
  });
});

describe.runIf(env.inviteCode)("POST /report: invite code (INVITE_CODE set)", () => {
  it("without a code → 401 invite_required", async () => {
    await expectError(await call("/report", { body: await body(), invite: null }), 401, "invite_required");
  });
  it("with a wrong code → 401 invite_required", async () => {
    await expectError(await call("/report", { body: await body(), invite: "wrong-code-contract-test" }), 401, "invite_required");
  });
});
