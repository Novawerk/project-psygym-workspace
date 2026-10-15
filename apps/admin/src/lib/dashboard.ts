// Reading the GET /admin/dashboard answer. The backend has already filtered, summed by period
// and hidden small counts; nothing here adds "<5" cells together.

import type { Count, Dashboard, Series } from "./types"

export const findSeries = (d: Dashboard, metric: string, dim = "") =>
  d.series.find((s) => s.metric === metric && s.dim === dim)

/** One value per period; a metric with no series had no counts at all in the range. */
export const valuesOf = (d: Dashboard, s: Series | undefined): Count[] => {
  if (!s) return d.periods.map(() => 0)
  const byPeriod = new Map(s.points.map((p) => [p.period, p.count]))
  return d.periods.map((p) => byPeriod.get(p) ?? 0)
}

export const totalOf = (s: Series | undefined): Count => s?.total ?? 0

/** a ÷ b, or null when either side is hidden or b is 0. */
export function ratio(a: Count, b: Count) {
  if (a === "<5" || b === "<5" || b === 0) return null
  return a / b
}

export function isSunday(day: string) {
  return new Date(`${day}T00:00:00Z`).getUTCDay() === 0
}

/** Daily average of active_day; "<5" if every day is hidden, null if some are (can't average). */
export function dailyAverage(s: Series): Count | null {
  const counts = s.points.map((p) => p.count)
  if (counts.length === 0) return 0
  if (counts.every((c) => c === "<5")) return "<5"
  if (counts.some((c) => c === "<5")) return null
  const avg = (counts as number[]).reduce((a, b) => a + b, 0) / counts.length
  return avg > 0 && avg < 5 ? "<5" : Math.round(avg)
}

/** active_week for the latest week in range: by day it sits on each Sunday. */
export function latestWeek(s: Series, granularity: "day" | "week"): Count | null {
  const pts = granularity === "day" ? s.points.filter((p) => isSunday(p.period)) : s.points
  return pts.length ? pts[pts.length - 1].count : null
}

export function formatPeriod(p: string, granularity: "day" | "week") {
  const md = `${p.slice(5, 7)}/${p.slice(8, 10)}`
  return granularity === "week" ? `${md} 周` : md
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export function lastDays(n: number) {
  const to = new Date()
  const from = new Date(to.getTime() - (n - 1) * 86_400_000)
  return { from: isoDay(from), to: isoDay(to) }
}
