import { describe, expect, it } from "vitest";
import { env } from "./env";
import { call, conversation, expectError, validBody } from "./http";

const endpoints = ["/chat", "/supervision"] as const;

describe.each(endpoints)("POST %s: 400 invalid_request", (path) => {
  const bad: [string, () => Promise<unknown>][] = [
    ["empty object", async () => ({})],
    ["missing caseId", async () => { const b: any = await validBody(); delete b.caseId; return b; }],
    ["caseId not a string", async () => ({ ...(await validBody()), caseId: 1 })],
    ["missing locale", async () => { const b: any = await validBody(); delete b.locale; return b; }],
    ["unknown locale", async () => ({ ...(await validBody()), locale: "de" })],
    ["missing messages", async () => { const b: any = await validBody(); delete b.messages; return b; }],
    ["messages not an array", async () => ({ ...(await validBody()), messages: "hi" })],
    ["empty messages", async () => ({ ...(await validBody()), messages: [] })],
    ["unknown role", async () => ({ ...(await validBody()), messages: [{ role: "therapist", text: "hi" }] })],
    ["text not a string", async () => ({ ...(await validBody()), messages: [{ role: "counselor", text: 42 }] })],
    ["last message is the client's", async () => ({ ...(await validBody()), messages: conversation(2).reverse() })],
    ["text over 2000 chars", async () => ({ ...(await validBody()), messages: [{ role: "counselor", text: "好".repeat(2001) }] })],
    ["81 messages", async () => ({ ...(await validBody()), messages: conversation(81) })],
  ];

  it.each(bad)("%s", async (_name, make) => {
    await expectError(await call(path, { body: await make() }), 400, "invalid_request");
  });

  it("body that is not JSON", async () => {
    await expectError(await call(path, { rawBody: "{not json" }), 400, "invalid_request");
  });

  it("body over the size limit (~1 MB)", async () => {
    const big = JSON.stringify({ ...(await validBody()), messages: conversation(80, "好".repeat(5000)) });
    await expectError(await call(path, { rawBody: big }), 400, "invalid_request");
  });
});

describe.each(endpoints)("POST %s: 404 case_not_found", (path) => {
  it("unknown caseId", async () => {
    const body = { ...(await validBody()), caseId: "no-such-case-contract-test" };
    await expectError(await call(path, { body }), 404, "case_not_found");
  });
});

describe.runIf(env.expectModelUnavailable).each(endpoints)("POST %s: 503 model_unavailable", (path) => {
  it("no model configured", async () => {
    await expectError(await call(path, { body: await validBody() }), 503, "model_unavailable");
  });
});

describe("invite code", () => {
  // /health is left out on purpose: the contract does not say whether it is checked.
  const guarded: [string, () => Promise<unknown | undefined>][] = [
    ["GET /cases", async () => undefined],
    ["POST /chat", () => validBody()],
    ["POST /supervision", () => validBody()],
  ];
  const pathOf = (name: string) => name.split(" ")[1];

  describe.runIf(env.inviteCode)("when the server checks codes (INVITE_CODE set)", () => {
    it.each(guarded)("%s without a code → 401 invite_required", async (name, body) => {
      const b = await body();
      await expectError(await call(pathOf(name), { body: b, invite: null }), 401, "invite_required");
    });
    it.each(guarded)("%s with a wrong code → 401 invite_required", async (name, body) => {
      const b = await body();
      await expectError(await call(pathOf(name), { body: b, invite: "wrong-code-contract-test" }), 401, "invite_required");
    });
    it("GET /cases with the right code → 200", async () => {
      expect((await call("/cases")).status).toBe(200);
    });
  });

  describe.skipIf(env.inviteCode)("when the server does not check codes (INVITE_CODE unset)", () => {
    it("GET /cases with no code → 200", async () => {
      expect((await call("/cases", { invite: null })).status).toBe(200);
    });
    it("GET /cases with any code → 200", async () => {
      expect((await call("/cases", { invite: "anything" })).status).toBe(200);
    });
  });
});
