// GET /admin/stats: the counts, with small cells hidden. Any cell under 5 shows "<5" so a
// quiet day on one case can't point at one person. Totals under 5 show "<5" too (a group of one
// small cell would otherwise give it away). Within each metric × dim group we never hide just
// one cell: if only one is hidden, the next smallest is hidden too, or the total minus the rest
// would give it away. Durations follow the same rules. This holds for one response only:
// subtracting results across different from/to ranges can still reveal a hidden cell (see ADR 0007).
import type { CountRow } from "./counter.js";

export const MIN_SHOWN = 5;
type Row = CountRow;
/**
 * Which rows of one group get hidden, by `size`: everything under MIN_SHOWN, and, if that is
 * exactly one row while others are shown, the smallest shown row as well.
 */
function hiddenRows(group: Row[], size: (r: Row) => number): Set<Row> {
  const counted = group.filter((r) => size(r) > 0);
  const hidden = new Set(counted.filter((r) => size(r) < MIN_SHOWN));
  const shownRows = counted.filter((r) => !hidden.has(r)).sort((a, b) => size(a) - size(b));
  if (hidden.size === 1 && shownRows.length > 0) hidden.add(shownRows[0]!);
  return hidden;
}

export function statsView(from: string, to: string, rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.metric}\u0000${r.dim}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const hideCount = new Set<Row>();
  const hideDuration = new Set<Row>();
  for (const g of groups.values()) {
    for (const r of hiddenRows(g, (x) => x.count)) hideCount.add(r);
    for (const r of hiddenRows(g, (x) => x.durationCount)) hideDuration.add(r);
  }

  const cells = rows.map((r) => ({
    day: r.day,
    metric: r.metric,
    caseId: r.caseId,
    locale: r.locale,
    dim: r.dim,
    count: hideCount.has(r) ? ("<5" as const) : r.count,
    ...(r.durationCount
      ? {
          durationSec: hideDuration.has(r)
            ? { sessions: "<5" as const, avgSec: null }
            : { sessions: r.durationCount, avgSec: Math.round(r.durationSumSec / r.durationCount) },
        }
      : {}),
  }));

  const totals = [...groups.values()].map((g) => {
    const count = g.reduce((n, r) => n + r.count, 0);
    const durN = g.reduce((n, r) => n + r.durationCount, 0);
    const durSum = g.reduce((n, r) => n + r.durationSumSec, 0);
    return {
      metric: g[0]!.metric,
      dim: g[0]!.dim,
      count: count < MIN_SHOWN ? ("<5" as const) : count,
      ...(durN
        ? { durationSec: durN < MIN_SHOWN ? { sessions: "<5" as const, avgSec: null } : { sessions: durN, avgSec: Math.round(durSum / durN) } }
        : {}),
    };
  });

  return { from, to, minShown: MIN_SHOWN, cells, totals };
}

const DAY_MS = 86_400_000;
/** ?from=&to= as UTC days. Default: the last 30 days up to today. */
export function statsRange(from: string | undefined, to: string | undefined, nowMs: number) {
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  const t = to ?? new Date(nowMs).toISOString().slice(0, 10);
  if (!ok(t)) return null;
  const f = from ?? new Date(Date.parse(`${t}T00:00:00Z`) - 29 * DAY_MS).toISOString().slice(0, 10);
  if (!ok(f)) return null;
  const days = (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / DAY_MS;
  if (days < 0 || days > 365) return null;
  return { from: f, to: t };
}
