// The production store: node-postgres against DATABASE_URL (Neon's pooled URL on Vercel).
// Loaded with a dynamic import, only when counting is on: with counting off, a cold start never
// touches drizzle-orm or pg. One small pool per warm instance; queries are single upserts.
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { DrizzleMetricsStore, type MetricsDb } from "./store.js";

/** A count must never hang around: connect, query and statement all give up after 2 s. */
export const DB_TIMEOUT_MS = 2000;

export function postgresStore(databaseUrl: string) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: DB_TIMEOUT_MS,
    query_timeout: DB_TIMEOUT_MS,
    statement_timeout: DB_TIMEOUT_MS,
  });
  // A broken idle connection must not crash the process; the next query reconnects.
  pool.on("error", () => {});
  // On Vercel: closes idle clients before the function is suspended. Elsewhere a no-op.
  attachDatabasePool(pool);
  return new DrizzleMetricsStore(drizzle(pool) as unknown as MetricsDb);
}
