// The only table: anonymous counts per day (UTC) × event × case × language × one extra
// dimension. No ids, no IPs, no invite codes, no text. See docs/decisions/0007-anonymous-counts.md.
import { bigint, date, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const dailyCounts = pgTable(
  "daily_counts",
  {
    day: date("day", { mode: "string" }).notNull(),
    metric: text("metric").notNull(),
    /** "" when the event has no case (e.g. a 401 before the body is read). */
    caseId: text("case_id").notNull().default(""),
    /** "zh" | "en" | "" */
    locale: text("locale").notNull().default(""),
    /** One extra dimension: error code, rating, report reason, turn bucket; "" when none. */
    dim: text("dim").notNull().default(""),
    count: integer("count").notNull().default(0),
    /** Session length, summed: only for reports whose request carried durationSec. */
    durationSumSec: bigint("duration_sum_sec", { mode: "number" }).notNull().default(0),
    durationCount: integer("duration_count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.metric, t.caseId, t.locale, t.dim] })],
);
