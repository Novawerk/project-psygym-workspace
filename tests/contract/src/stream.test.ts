import { describe, expect, it } from "vitest";
import { env } from "./env";
import { call, conversation, validBody, type Locale } from "./http";
import { frameProblems, joinedText, readStream } from "./sse";

const endpoints = ["/chat", "/supervision"] as const;
const locales: Locale[] = ["zh", "en"];

describe.skipIf(env.expectModelUnavailable).each(endpoints)("POST %s stream", (path) => {
  it.each(locales)("locale %s: 200 text/event-stream, turn_start → text_delta* → turn_end", async (locale) => {
    const res = await call(path, { body: await validBody(locale) });
    expect(res.status, await peek(res)).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/^text\/event-stream/);
    const r = await readStream(res, env.streamTimeoutMs);
    expect(frameProblems(r)).toEqual([]);
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
    expect(frameProblems(r)).toEqual([]);
  });
});

/** For failure messages: read a non-200 body without consuming a 200 stream. */
async function peek(res: Response): Promise<string> {
  if (res.status === 200) return "";
  return `HTTP ${res.status}: ${(await res.clone().text()).slice(0, 300)}`;
}
