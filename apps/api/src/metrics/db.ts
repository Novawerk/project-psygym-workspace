// The production store: node-postgres against DATABASE_URL (Neon's pooled URL on Vercel).
// One small pool per warm instance; queries are single upserts.
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { DrizzleMetricsStore, type MetricsDb } from "./index.js";

export function postgresStore(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  // A broken idle connection must not crash the process; the next query reconnects.
  pool.on("error", () => {});
  return new DrizzleMetricsStore(drizzle(pool) as unknown as MetricsDb);
}
