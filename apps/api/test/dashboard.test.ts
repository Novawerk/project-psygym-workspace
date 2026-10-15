// The dashboard's hiding (src/metrics/dashboard.ts): a pure function, no database.
import { describe, expect, it } from "vitest";

import type { CountRow } from "../src/metrics/counter.js";
import { dashboardView, hiddenCells, mondayOf, periodsOf } from "../src/metrics/dashboard.js";

const row = (day: string, metric: string, count: number, extra: Partial<CountRow> = {}): CountRow => ({
  day,
  metric,
  caseId: "c",
  locale: "zh",
  dim: "",
  count,
  durationSumSec: 0,
  durationCount: 0,
  ...extra,
});
const q = { from: "2026-10-12", to: "2026-10-14", granularity: "day" as const, caseId: null, locale: null };

describe("hiddenCells", () => {
  it("hides under 5, and a second cell where one alone would be given away, until stable", () => {
    expect(hiddenCells([[3, 10, 20]])).toEqual([[true, true, false]]);
    expect(hiddenCells([[0, 10, 20]])).toEqual([[false, false, false]]);
    expect(hiddenCells([[3], [8]])).toEqual([[true], [true]]);
    // Hiding 8 in row 2 leaves column 1 with one hidden cell: 9 goes too.
    expect(hiddenCells([[9, 7], [8, 2]])).toEqual([[true, true], [true, true]]);
  });
});

describe("dashboardView", () => {
  it("a bucket can't be had as the period total minus the other buckets", () => {
    const rows = [
      row("2026-10-12", "session_duration", 3, { dim: "0-5m" }),
      row("2026-10-12", "session_duration", 12, { dim: "5-10m" }),
      row("2026-10-12", "report_generated", 15, { dim: "6-15", durationCount: 15, durationSumSec: 15 * 400 }),
    ];
    const v = dashboardView(q, rows, []);
    const dur = v.series.filter((s) => s.metric === "session_duration");
    expect(dur.map((s) => s.points[0]!.count)).toEqual(["<5", "<5"]);
    // The sessions with a duration are that period's total: shown, since both buckets are hidden.
    expect(v.duration.points[0]!.value).toEqual({ sessions: 15, avgSec: 400 });
    expect(v.duration.total).toEqual({ sessions: 15, avgSec: 400 });
  });

  it("weeks start on Monday; every period is listed, zeros included", () => {
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
    expect(periodsOf({ from: "2026-10-10", to: "2026-10-20", granularity: "week" })).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    const v = dashboardView(q, [row("2026-10-13", "chat_turn", 40)], []);
    expect(v.series[0]!.points).toEqual([
      { period: "2026-10-12", count: 0 },
      { period: "2026-10-13", count: 40 },
      { period: "2026-10-14", count: 0 },
    ]);
    expect(v.active).toEqual({ day: expect.objectContaining({ total: 0 }), week: expect.objectContaining({ total: 0 }) });
  });

  it("a filter leaves out other cases, other languages, and the counts without a case", () => {
    const rows = [row("2026-10-12", "chat_turn", 10), row("2026-10-12", "chat_turn", 20, { caseId: "d" }), row("2026-10-12", "error", 9, { caseId: "", locale: "", dim: "internal" })];
    const v = dashboardView({ ...q, caseId: "c" }, rows, []);
    expect(v.series).toEqual([{ metric: "chat_turn", dim: "", points: [{ period: "2026-10-12", count: 10 }, { period: "2026-10-13", count: 0 }, { period: "2026-10-14", count: 0 }], total: 10 }]);
    expect(v.active).toBeNull();
  });
});
