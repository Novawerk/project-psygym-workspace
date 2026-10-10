// A small SSE reader on top of fetch's ReadableStream. No dependencies on purpose:
// the app parses the same bytes, so we parse them the way the spec says.

export type Frame =
  | { type: "turn_start" }
  | { type: "text_delta"; text: string }
  | { type: "turn_end"; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "error"; code: string; message: string };

export type SseEvent = { data: string; event?: string };

export type StreamResult = {
  events: SseEvent[];
  comments: string[];
  /** data payloads that were not valid JSON */
  badJson: string[];
  frames: Record<string, unknown>[];
  timedOut: boolean;
};

/** Parse a complete SSE body (or a prefix of one). Exported for the unit test. */
export function parseSse(raw: string): { events: SseEvent[]; comments: string[]; rest: string } {
  const text = raw.replace(/\r\n?/g, "\n");
  const blocks = text.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: SseEvent[] = [];
  const comments: string[] = [];
  for (const block of blocks) {
    const data: string[] = [];
    let event: string | undefined;
    for (const line of block.split("\n")) {
      if (line === "") continue;
      if (line.startsWith(":")) {
        comments.push(line.slice(1).trimStart());
        continue;
      }
      const i = line.indexOf(":");
      const field = i === -1 ? line : line.slice(0, i);
      let value = i === -1 ? "" : line.slice(i + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") data.push(value);
      else if (field === "event") event = value;
    }
    if (data.length > 0) events.push({ data: data.join("\n"), event });
  }
  return { events, comments, rest };
}

export async function readStream(res: Response, timeoutMs: number): Promise<StreamResult> {
  if (!res.body) throw new Error("response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
  } catch (e) {
    if (!timedOut) throw e;
  } finally {
    clearTimeout(timer);
  }
  buf += decoder.decode();
  // A final block without the trailing blank line still counts.
  const { events, comments } = parseSse(buf.endsWith("\n\n") ? buf : buf + "\n\n");
  const frames: Record<string, unknown>[] = [];
  const badJson: string[] = [];
  for (const e of events) {
    try {
      frames.push(JSON.parse(e.data));
    } catch {
      badJson.push(e.data);
    }
  }
  return { events, comments, badJson, frames, timedOut };
}

/**
 * Check the frame order from the contract:
 *   turn_start → text_delta* → (turn_end | error), nothing after.
 * Returns a list of problems; empty means the stream is valid.
 */
export function frameProblems(r: StreamResult): string[] {
  const p: string[] = [];
  if (r.timedOut) p.push("stream did not end before the timeout");
  if (r.badJson.length) p.push(`data that is not JSON: ${JSON.stringify(r.badJson.slice(0, 3))}`);
  for (const e of r.events) {
    if (e.event !== undefined) p.push(`unexpected "event:" field (${e.event}); contract is data-only`);
  }
  const f = r.frames;
  if (f.length === 0) return [...p, "no frames"];
  if (f[0].type !== "turn_start") p.push(`first frame is ${JSON.stringify(f[0])}, want turn_start`);
  const last = f[f.length - 1];
  if (last.type !== "turn_end" && last.type !== "error") {
    p.push(`last frame is ${JSON.stringify(last)}, want turn_end or error`);
  }
  f.forEach((fr, i) => {
    const isFirst = i === 0;
    const isLast = i === f.length - 1;
    switch (fr.type) {
      case "turn_start":
        if (!isFirst) p.push(`turn_start at position ${i}`);
        break;
      case "text_delta":
        if (isFirst || isLast) p.push(`text_delta at position ${i}`);
        if (typeof fr.text !== "string") p.push(`text_delta.text is not a string at ${i}`);
        break;
      case "turn_end":
        if (!isLast) p.push(`turn_end at ${i} is not the last frame`);
        if (fr.usage !== undefined) {
          const u = fr.usage as Record<string, unknown>;
          for (const k of ["inputTokens", "outputTokens"]) {
            if (typeof u?.[k] !== "number" || (u[k] as number) < 0) {
              p.push(`turn_end.usage.${k} is not a non-negative number`);
            }
          }
        }
        break;
      case "error":
        if (!isLast) p.push(`error at ${i} is not the last frame`);
        if (typeof fr.code !== "string" || !fr.code) p.push("error.code is not a non-empty string");
        if (typeof fr.message !== "string") p.push("error.message is not a string");
        break;
      default:
        p.push(`unknown frame type at ${i}: ${JSON.stringify(fr)}`);
    }
  });
  return p;
}

export function joinedText(r: StreamResult): string {
  return r.frames
    .filter((f) => f.type === "text_delta")
    .map((f) => f.text as string)
    .join("");
}
