import { describe, expect, it } from "vitest";
import { env } from "./env";
import { call, conversation, validBody, type Locale } from "./http";
import { countType, frameProblems, joinedText, readStream } from "./sse";

const endpoints = ["/chat", "/supervision"] as const;
const locales: Locale[] = ["zh", "en"];

describe.skipIf(env.expectModelUnavailable).each(endpoints)("POST %s stream", (path) => {
  it.each(locales)("locale %s: 200 text/event-stream, turn_start → text_delta* → turn_end", async (locale) => {
    const res = await call(path, { body: await validBody(locale) });
    expect(res.status, await peek(res)).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/^text\/event-stream/);
    const r = await readStream(res, env.streamTimeoutMs);
    expect(frameProblems(r, { sessionEnd: path === "/chat" })).toEqual([]);
    // An opening line is no reason to end the session.
    expect(countType(r, "session_end")).toBe(0);
    const last = r.frames[r.frames.length - 1];
    // A healthy server with a model should finish the turn, not error out.
    expect(last, JSON.stringify(last)).toMatchObject({ type: "turn_end" });
    expect(joinedText(r).trim().length).toBeGreaterThan(0);
  });


  it("accepts the limits exactly: 80 messages, 2000-char text", async () => {
    const msgs = conversation(80);
    msgs[msgs.length - 1] = { role: "counselor", text: "好".repeat(2000) };
    const res = await call(path, { body: await validBody("zh", msgs) });
    expect(res.status, await peek(res)).toBe(200);
    const r = await readStream(res, env.streamTimeoutMs);
    expect(frameProblems(r, { sessionEnd: path === "/chat" })).toEqual([]);
  });
});

describe.skipIf(env.expectModelUnavailable)("POST /supervision, any shape of session", () => {
  it.each([
    ["ends on the client", () => conversation(2).reverse()],
    ["one counselor line only (very short session)", () => conversation(1)],
    ["one client line only", () => [{ role: "client" as const, text: "嗯。" }]],
  ])("%s → 200 and a full report", async (_name, msgs) => {
    const res = await call("/supervision", { body: await validBody("zh", msgs()) });
    expect(res.status, await peek(res)).toBe(200);
    const r = await readStream(res, env.streamTimeoutMs);
    expect(frameProblems(r, { sessionEnd: false })).toEqual([]);
    expect(r.frames[r.frames.length - 1]).toMatchObject({ type: "turn_end" });
    expect(joinedText(r).trim().length).toBeGreaterThan(0);
  });
});

describe.skipIf(env.expectModelUnavailable)("POST /supervision, mode", () => {
  // "final" (or no mode) is the full report; "live" is short mid-session notes, same frames.
  it.each(["final", "live"])("mode %s → 200, turn_start → text_delta* → turn_end", async (mode) => {
    const body = { ...(await validBody("zh", conversation(5))), mode };
    const res = await call("/supervision", { body });
    expect(res.status, await peek(res)).toBe(200);
    const r = await readStream(res, env.streamTimeoutMs);
    expect(frameProblems(r, { sessionEnd: false })).toEqual([]);
    expect(r.frames[r.frames.length - 1]).toMatchObject({ type: "turn_end" });
    expect(joinedText(r).trim().length).toBeGreaterThan(0);
  });
});

describe.skipIf(env.expectModelUnavailable)("POST /supervision, durationSec (optional, 0–7200 whole seconds)", () => {
  // A valid value is taken; anything else is ignored, never a 400. It never changes the report.
  it.each([
    ["a valid value", 600],
    ["0", 0],
    ["7200", 7200],
    ["over 7200", 7201],
    ["negative", -5],
    ["not whole", 1.5],
    ["a string", "600"],
    ["null", null],
  ])("%s → 200 and a full report", async (_name, durationSec) => {
    const body = { ...(await validBody("zh", conversation(2).reverse())), durationSec };
    const res = await call("/supervision", { body });
    expect(res.status, await peek(res)).toBe(200);
    const r = await readStream(res, env.streamTimeoutMs);
    expect(frameProblems(r, { sessionEnd: false })).toEqual([]);
    expect(r.frames[r.frames.length - 1]).toMatchObject({ type: "turn_end" });
  });
});

describe.skipIf(env.expectModelUnavailable || !env.endTrigger)("session_end (END_TRIGGER set, mock model)", () => {
  const ending = () => conversation(3).map((m, i, a) => (i === a.length - 1 ? { ...m, text: `好的。${env.endTrigger}` } : m));

  it("POST /chat: the client says a closing line, then exactly one session_end right before turn_end", async () => {
    const res = await call("/chat", { body: await validBody("zh", ending()) });
    expect(res.status, await peek(res)).toBe(200);
    const r = await readStream(res, env.streamTimeoutMs);
    expect(frameProblems(r)).toEqual([]);
    expect(countType(r, "session_end")).toBe(1);
    expect(r.frames.map((f) => f.type).slice(-2)).toEqual(["session_end", "turn_end"]);
    expect(joinedText(r).trim().length, "closing line").toBeGreaterThan(0);
  });

  it("POST /supervision with the same conversation: no session_end", async () => {
    const res = await call("/supervision", { body: await validBody("zh", ending()) });
    expect(res.status, await peek(res)).toBe(200);
    const r = await readStream(res, env.streamTimeoutMs);
    expect(frameProblems(r, { sessionEnd: false })).toEqual([]);
    expect(r.frames[r.frames.length - 1]).toMatchObject({ type: "turn_end" });
  });
});

/** For failure messages: read a non-200 body without consuming a 200 stream. */
async function peek(res: Response): Promise<string> {
  if (res.status === 200) return "";
  return `HTTP ${res.status}: ${(await res.clone().text()).slice(0, 300)}`;
}
