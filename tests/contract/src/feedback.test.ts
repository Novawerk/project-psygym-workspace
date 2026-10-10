// POST /feedback: a rating of one supervision report. docs/api-contract.md
//
// Never run this against a server with FEEDBACK_SLACK_WEBHOOK_URL set (in its environment
// or in apps/api/.env, which apps/api reads at start): every 204 here would post to the
// team's Slack channel.
import { describe, expect, it } from "vitest";
import { env } from "./env";
import { call, caseId, expectError } from "./http";

async function body(extra: Record<string, unknown> = {}) {
  return { caseId: await caseId(), locale: "zh", rating: "up", ...extra };
}

async function expect204(res: Response) {
  const text = await res.text();
  expect(res.status, text.slice(0, 300)).toBe(204);
  expect(text).toBe("");
}

describe("POST /feedback: 204", () => {
  it.each([
    ["up, zh, no comment", {}],
    ["down, en, no comment", { rating: "down", locale: "en" }],
    ["with a short comment", { comment: "引用很准。" }],
    ["with an empty comment", { comment: "" }],
    ["with a 500-character comment", { comment: "好".repeat(500) }],
    // 500 characters, 1000 UTF-16 units: a server counting UTF-16 would wrongly reject it.
    ["with a 500-emoji comment", { comment: "😀".repeat(500) }],
  ])("%s", async (_name, extra) => {
    await expect204(await call("/feedback", { body: await body(extra) }));
  });
});

describe("POST /feedback: 400 invalid_request", () => {
  const bad: [string, () => Promise<unknown>][] = [
    ["empty object", async () => ({})],
    ["missing caseId", async () => { const b: any = await body(); delete b.caseId; return b; }],
    ["missing locale", async () => { const b: any = await body(); delete b.locale; return b; }],
    ["unknown locale", () => body({ locale: "de" })],
    ["missing rating", async () => { const b: any = await body(); delete b.rating; return b; }],
    ["rating not up/down", () => body({ rating: "meh" })],
    ["rating as a boolean", () => body({ rating: true })],
    ["rating as a number", () => body({ rating: 5 })],
    ["comment not a string", () => body({ comment: 42 })],
    ["comment of 501 characters", () => body({ comment: "好".repeat(501) })],
    ["comment of 501 emoji", () => body({ comment: "😀".repeat(501) })],
    // The conversation is never a field.
    ["extra field: messages", () => body({ messages: [{ role: "counselor", text: "你好" }] })],
    ["extra field: transcript", () => body({ transcript: "你好" })],
    ["extra field: anything else", () => body({ foo: 1 })],
  ];
  it.each(bad)("%s", async (_name, make) => {
    await expectError(await call("/feedback", { body: await make() }), 400, "invalid_request");
  });
  it("body that is not JSON", async () => {
    await expectError(await call("/feedback", { rawBody: "{not json" }), 400, "invalid_request");
  });
});

describe("POST /feedback: 404 case_not_found", () => {
  it("unknown caseId", async () => {
    await expectError(await call("/feedback", { body: await body({ caseId: "no-such-case-contract-test" }) }), 404, "case_not_found");
  });
});

describe.runIf(env.inviteCode)("POST /feedback: invite code (INVITE_CODE set)", () => {
  it("without a code → 401 invite_required", async () => {
    await expectError(await call("/feedback", { body: await body(), invite: null }), 401, "invite_required");
  });
  it("with a wrong code → 401 invite_required", async () => {
    await expectError(await call("/feedback", { body: await body(), invite: "wrong-code-contract-test" }), 401, "invite_required");
  });
});
