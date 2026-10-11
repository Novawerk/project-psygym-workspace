// Anonymous counts: fire and forget. A failed write is one log line and never touches the
// request. Nothing here sees message text, invite codes or IPs: callers pass only an event
// name, a case id, a language, one enum-like dimension and (for reports) a duration.
//
// No database code in this file on purpose: the app imports it on every cold start, and with
// counting off it must not pull in drizzle-orm or pg. The store lives in ./store.ts and is
// loaded only when counting is on (src/index.ts).

export const METRICS = [
  "session_started", // /chat with the counselor's first line
  "chat_turn", // a /chat turn that ended with turn_end
  "session_ended_by_client", // a /chat stream that carried session_end
  "report_generated", // a /supervision stream that ended with turn_end; dim = turn bucket
  "report_failed", // a /supervision stream (final report) that ended with an error frame
  "live_supervision", // a /supervision stream with mode "live" that ended with turn_end; dim = turn bucket
  "session_duration", // with report_generated, when the app sent durationSec; dim = length bucket
  "feedback", // dim = up | down
  "user_report", // dim = reason
  "error", // dim = error code (pre-stream codes, or stream_error)
] as const;
export type Metric = (typeof METRICS)[number];

export interface CountEvent {
  metric: Metric;
  caseId?: string;
  locale?: string;
  dim?: string;
  /** Seconds; only for report_generated. */
  durationSec?: number;
}

/**
 * Before anything is stored: a case id outside the known cases, or a language other than zh/en,
 * becomes "unknown", so no request can write its own strings into the table.
 */
export function normalizeEvent(e: CountEvent, knownCases: { has(id: string): boolean }): CountEvent {
  return {
    ...e,
    ...(e.caseId !== undefined ? { caseId: knownCases.has(e.caseId) ? e.caseId : "unknown" } : {}),
    ...(e.locale !== undefined ? { locale: e.locale === "zh" || e.locale === "en" ? e.locale : "unknown" } : {}),
  };
}

/** Turns in the session, bucketed (docs/product/admin.md): 1–5, 6–15, 16–30, 31+. */
export function turnBucket(messages: number): string {
  if (messages <= 5) return "1-5";
  if (messages <= 15) return "6-15";
  if (messages <= 30) return "16-30";
  return "31+";
}

/** Session length, bucketed (docs/product/admin.md): 0–5, 5–10, 10–20, 20–40, 40+ minutes. */
export function durationBucket(sec: number): string {
  const min = sec / 60;
  if (min < 5) return "0-5m";
  if (min < 10) return "5-10m";
  if (min < 20) return "10-20m";
  if (min < 40) return "20-40m";
  return "40m+";
}

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** One row of daily_counts, as the store returns it (mirrors ./schema.ts). */
export interface CountRow {
  day: string;
  metric: string;
  caseId: string;
  locale: string;
  dim: string;
  count: number;
  durationSumSec: number;
  durationCount: number;
}

export interface MetricsStore {
  increment(day: string, e: CountEvent): Promise<void>;
  rows(from: string, to: string): Promise<CountRow[]>;
}

export interface Counter {
  readonly enabled: boolean;
  /** Fire and forget. Never throws, never awaits in the caller's path. */
  count(e: CountEvent): void;
}

export const disabledCounter: Counter = { enabled: false, count: () => {} };

/**
 * Counts through `store`. Each write runs on its own; `keepAlive` (Vercel's waitUntil) keeps the
 * function alive until it settles. Errors become one log line with the error's kind only.
 */
export function createCounter(opts: {
  store: MetricsStore;
  now?: () => number;
  keepAlive?: (p: Promise<unknown>) => void;
  onError: (err: unknown, e: CountEvent) => void;
}): Counter {
  const now = opts.now ?? Date.now;
  return {
    enabled: true,
    count(e) {
      const p = Promise.resolve()
        .then(() => opts.store.increment(utcDay(now()), e))
        .catch((err) => opts.onError(err, e));
      opts.keepAlive?.(p);
    },
  };
}
