// GET /admin/dashboard (docs/admin-api.md): daily_counts filtered by case and language, summed
// by day or ISO week, then hidden, all here and never on the page. Per metric the counts form a
// table, periods × (each dim, and the metric's total for the period): every non-zero cell under
// 5 shows "<5"; in any row or column where that leaves exactly one hidden cell next to shown
// ones, the smallest shown one is hidden too, again and again until nothing changes. So no hidden
// cell is a total minus the rest. The period total is in the table because the page could add
// the dims up (and for session_duration it is shown: the sessions in `duration`). Totals under 5
// show "<5". As in ADR 0007, this protects one response; two responses with different filters
// can still be subtracted.
import type { CountRow } from "./counter.js";
import { MIN_SHOWN } from "./stats.js";

export type Count = number | "<5";
export interface Series {
  metric: string;
  dim: string;
  points: { period: string; count: Count }[];
  total: Count;
}
export interface Duration {
  sessions: Count;
  avgSec: number | null;
}

export interface DashboardQuery {
  from: string;
  to: string;
  granularity: "day" | "week";
  caseId: string | null;
  locale: "zh" | "en" | null;
}

const DAY_MS = 86_400_000;
const ACTIVE = ["active_day", "active_week"];
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Monday of a day's ISO week. */
export function mondayOf(day: string): string {
  const ms = dayMs(day);
  const dow = new Date(ms).getUTCDay() || 7;
  return isoDay(ms - (dow - 1) * DAY_MS);
}

export function periodsOf(q: Pick<DashboardQuery, "from" | "to" | "granularity">): string[] {
  const out: string[] = [];
  for (let ms = dayMs(q.from); ms <= dayMs(q.to); ms += DAY_MS) {
    const p = q.granularity === "day" ? isoDay(ms) : mondayOf(isoDay(ms));
    if (out.at(-1) !== p) out.push(p);
  }
  return out;
}

/**
 * Which cells of a table (rows × columns of non-negative numbers) to hide. Exported for tests.
 * `cells[r][c]`; zeros are never hidden and never count.
 */
export function hiddenCells(cells: number[][]): boolean[][] {
  const hidden = cells.map((row) => row.map((v) => v > 0 && v < MIN_SHOWN));
  const lines: [number, number][][] = [];
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  for (let r = 0; r < rows; r++) lines.push(Array.from({ length: cols }, (_, c) => [r, c] as [number, number]));
  for (let c = 0; c < cols; c++) lines.push(Array.from({ length: rows }, (_, r) => [r, c] as [number, number]));
  for (let changed = true; changed; ) {
    changed = false;
    for (const line of lines) {
      const live = line.filter(([r, c]) => cells[r]![c]! > 0);
      const hiddenHere = live.filter(([r, c]) => hidden[r]![c]);
      const shown = live.filter(([r, c]) => !hidden[r]![c]).sort(([a, b], [x, y]) => cells[a]![b]! - cells[x]![y]!);
      if (hiddenHere.length === 1 && shown.length > 0) {
        const [r, c] = shown[0]!;
        hidden[r]![c] = true;
        changed = true;
      }
    }
  }
  return hidden;
}

const shownCount = (n: number, hide: boolean): Count => (hide ? "<5" : n);
const totalOf = (n: number): Count => (n > 0 && n < MIN_SHOWN ? "<5" : n);

export function dashboardView(q: DashboardQuery, rows: CountRow[], cases: { id: string; title: { zh: string; en: string | null } }[]) {
  const periods = periodsOf(q);
  const index = new Map(periods.map((p, i) => [p, i]));
  const periodOf = (day: string) => (q.granularity === "day" ? day : mondayOf(day));
  const filtered = q.caseId !== null || q.locale !== null;

  // metric → dim → per-period sums
  const counts = new Map<string, Map<string, number[]>>();
  const durSessions = periods.map(() => 0);
  const durSum = periods.map(() => 0);
  for (const r of rows) {
    const i = index.get(periodOf(r.day));
    if (i === undefined) continue;
    const isActive = ACTIVE.includes(r.metric);
    if (filtered && isActive) continue;
    if (q.caseId !== null && r.caseId !== q.caseId) continue;
    if (q.locale !== null && r.locale !== q.locale) continue;
    const byDim = counts.get(r.metric) ?? new Map<string, number[]>();
    counts.set(r.metric, byDim);
    const arr = byDim.get(r.dim) ?? periods.map(() => 0);
    byDim.set(r.dim, arr);
    arr[i]! += r.count;
    if (r.metric === "report_generated" && r.durationCount > 0) {
      durSessions[i]! += r.durationCount;
      durSum[i]! += r.durationSumSec;
    }
  }

  /** Per metric: which periods' totals were hidden (the last column of its table). */
  const totalHidden = new Map<string, boolean[]>();
  const seriesOf = (metric: string): Series[] => {
    const byDim = counts.get(metric);
    if (!byDim) return [];
    const dims = [...byDim.keys()].sort();
    // rows = periods, columns = dims, then the period's total
    const table = periods.map((_, i) => {
      const row = dims.map((d) => byDim.get(d)![i]!);
      return [...row, row.reduce((a, b) => a + b, 0)];
    });
    const hide = hiddenCells(table);
    totalHidden.set(metric, hide.map((row) => row[dims.length]!));
    return dims
      .map((dim, c) => {
        const values = periods.map((_, i) => table[i]![c]!);
        return {
          metric,
          dim,
          points: periods.map((period, i) => ({ period, count: shownCount(values[i]!, hide[i]![c]!) })),
          total: totalOf(values.reduce((a, b) => a + b, 0)),
          sum: values.reduce((a, b) => a + b, 0),
        };
      })
      .filter((s) => s.sum > 0)
      .map(({ sum: _sum, ...s }) => s);
  };

  const metrics = [...counts.keys()].filter((m) => !ACTIVE.includes(m)).sort();
  const series = metrics.flatMap(seriesOf);

  // The sessions with a duration are session_duration's period totals: hidden with its table.
  const durHide = totalHidden.get("session_duration") ?? hiddenCells(durSessions.map((n) => [n])).map((r) => r[0]!);
  const totalSessions = durSessions.reduce((a, b) => a + b, 0);
  const totalSum = durSum.reduce((a, b) => a + b, 0);
  const duration = {
    points: periods.map((period, i) => ({
      period,
      value:
        durSessions[i] === 0
          ? { sessions: 0, avgSec: null }
          : durHide[i]
            ? { sessions: "<5" as const, avgSec: null }
            : { sessions: durSessions[i]!, avgSec: Math.round(durSum[i]! / durSessions[i]!) },
    })),
    total:
      totalSessions === 0
        ? { sessions: 0, avgSec: null }
        : totalSessions < MIN_SHOWN
          ? { sessions: "<5" as const, avgSec: null }
          : { sessions: totalSessions, avgSec: Math.round(totalSum / totalSessions) },
  } satisfies { points: { period: string; value: Duration }[]; total: Duration };

  const emptyActive = (metric: string): Series => ({ metric, dim: "", points: periods.map((period) => ({ period, count: 0 })), total: 0 });
  const active = filtered
    ? null
    : { day: seriesOf("active_day")[0] ?? emptyActive("active_day"), week: seriesOf("active_week")[0] ?? emptyActive("active_week") };

  return {
    from: q.from,
    to: q.to,
    granularity: q.granularity,
    filters: { caseId: q.caseId, locale: q.locale },
    minShown: MIN_SHOWN,
    periods,
    series,
    duration,
    active,
    cases,
  };
}
