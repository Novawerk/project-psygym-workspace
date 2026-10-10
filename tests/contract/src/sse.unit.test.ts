// Tests for the suite's own SSE reader. No server needed.
import { describe, expect, it } from "vitest";
import { frameProblems, parseSse, type StreamResult } from "./sse";

const result = (frames: Record<string, unknown>[]): StreamResult => ({
  events: frames.map((f) => ({ data: JSON.stringify(f) })),
  comments: [],
  badJson: [],
  frames,
  timedOut: false,
});

describe("parseSse", () => {
  it("reads data frames, skips comments, keeps an unfinished tail", () => {
    const raw = 'data: {"type":"turn_start"}\n\n: ping\n\ndata: {"type":"text_delta","text":"a"}\r\n\r\ndata: {"ty';
    const { events, comments, rest } = parseSse(raw);
    expect(events.map((e) => e.data)).toEqual(['{"type":"turn_start"}', '{"type":"text_delta","text":"a"}']);
    expect(comments).toEqual(["ping"]);
    expect(rest).toBe('data: {"ty');
  });

  it("joins multi-line data with newlines", () => {
    expect(parseSse("data: a\ndata: b\n\n").events[0].data).toBe("a\nb");
  });
});

describe("frameProblems", () => {
  it("accepts start → deltas → end", () => {
    expect(
      frameProblems(result([{ type: "turn_start" }, { type: "text_delta", text: "x" }, { type: "turn_end" }])),
    ).toEqual([]);
  });
  it("accepts start → error", () => {
    expect(frameProblems(result([{ type: "turn_start" }, { type: "error", code: "model_unavailable", message: "" }]))).toEqual([]);
  });
  it("rejects a missing turn_start, frames after the end, two endings", () => {
    expect(frameProblems(result([{ type: "text_delta", text: "x" }, { type: "turn_end" }]))).not.toEqual([]);
    expect(frameProblems(result([{ type: "turn_start" }, { type: "turn_end" }, { type: "text_delta", text: "x" }]))).not.toEqual([]);
    expect(frameProblems(result([{ type: "turn_start" }, { type: "turn_end" }, { type: "error", code: "x", message: "" }]))).not.toEqual([]);
  });
  it("accepts session_end right before turn_end", () => {
    expect(frameProblems(result([{ type: "turn_start" }, { type: "text_delta", text: "再见" }, { type: "session_end" }, { type: "turn_end" }]))).toEqual([]);
  });
  it("rejects session_end anywhere else, twice, before an error, or where it is not allowed", () => {
    const s = { type: "session_end" }, st = { type: "turn_start" }, d = { type: "text_delta", text: "x" }, e = { type: "turn_end" };
    expect(frameProblems(result([st, s, d, e]))).not.toEqual([]);
    expect(frameProblems(result([st, d, s, s, e]))).not.toEqual([]);
    expect(frameProblems(result([st, d, s, { type: "error", code: "x", message: "" }]))).not.toEqual([]);
    expect(frameProblems(result([st, d, s, e]), { sessionEnd: false })).not.toEqual([]);
  });
  it("rejects a stream with no ending, unknown types and bad usage", () => {
    expect(frameProblems(result([{ type: "turn_start" }, { type: "text_delta", text: "x" }]))).not.toEqual([]);
    expect(frameProblems(result([{ type: "turn_start" }, { type: "thinking" }, { type: "turn_end" }]))).not.toEqual([]);
    expect(frameProblems(result([{ type: "turn_start" }, { type: "turn_end", usage: { inputTokens: "1" } }]))).not.toEqual([]);
  });
});
