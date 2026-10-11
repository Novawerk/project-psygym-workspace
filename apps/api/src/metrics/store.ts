// The Drizzle store for daily_counts. Loaded only when counting is on (see ./counter.ts).
import { and, gte, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { CountEvent, CountRow, MetricsStore } from "./counter.js";
import { dailyCounts } from "./schema.js";

// Any Drizzle Postgres database: node-postgres in production, PGlite in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MetricsDb = PgDatabase<PgQueryResultHKT, any>;

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

  rows(from: string, to: string): Promise<CountRow[]> {
    return this.db
      .select()
      .from(dailyCounts)
      .where(and(gte(dailyCounts.day, from), lte(dailyCounts.day, to)))
      .orderBy(dailyCounts.day, dailyCounts.metric, dailyCounts.caseId, dailyCounts.locale, dailyCounts.dim);
  }
}

