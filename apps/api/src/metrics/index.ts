// Anonymous counts: fire and forget. A failed write is one log line and never touches the
// request. Nothing here sees message text, invite codes or IPs: callers pass only an event
// name, a case id, a language, one enum-like dimension and (for reports) a duration.
import { and, gte, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { dailyCounts } from "./schema.js";

export const METRICS = [
  "session_started", // /chat with the counselor's first line
  "chat_turn", // a /chat turn that ended with turn_end
  "session_ended_by_client", // a /chat stream that carried session_end
  "report_generated", // a /supervision stream that ended with turn_end; dim = turn bucket
  "report_failed", // a /supervision stream that ended with an error frame
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

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Any Drizzle Postgres database: node-postgres in production, PGlite in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MetricsDb = PgDatabase<PgQueryResultHKT, any>;

export interface MetricsStore {
  increment(day: string, e: CountEvent): Promise<void>;
  rows(from: string, to: string): Promise<(typeof dailyCounts.$inferSelect)[]>;
}

export class DrizzleMetricsStore implements MetricsStore {
  constructor(private readonly db: MetricsDb) {}

  async increment(day: string, e: CountEvent): Promise<void> {
    const d = e.durationSec;
    const withDuration = d !== undefined ? 1 : 0;
    await this.db
      .insert(dailyCounts)
      .values({
        day,
        metric: e.metric,
        caseId: e.caseId ?? "",
        locale: e.locale ?? "",
        dim: e.dim ?? "",
        count: 1,
        durationSumSec: d ?? 0,
        durationCount: withDuration,
      })
      .onConflictDoUpdate({
        target: [dailyCounts.day, dailyCounts.metric, dailyCounts.caseId, dailyCounts.locale, dailyCounts.dim],
        set: {
          count: sql`${dailyCounts.count} + 1`,
          durationSumSec: sql`${dailyCounts.durationSumSec} + ${d ?? 0}`,
          durationCount: sql`${dailyCounts.durationCount} + ${withDuration}`,
        },
      });
  }

  rows(from: string, to: string) {
    return this.db
      .select()
      .from(dailyCounts)
      .where(and(gte(dailyCounts.day, from), lte(dailyCounts.day, to)))
      .orderBy(dailyCounts.day, dailyCounts.metric, dailyCounts.caseId, dailyCounts.locale, dailyCounts.dim);
  }
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
