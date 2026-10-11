// The production database: node-postgres against DATABASE_URL (Neon's pooled URL on Vercel).
// Loaded with a dynamic import, only when counting or sign-in is on: with both off, a cold start
// never touches drizzle-orm or pg. One small pool per warm instance.
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { DrizzleMetricsStore, type MetricsDb } from "./store.js";

/** A count must never hang around: connect, query and statement all give up after 2 s. */
export const DB_TIMEOUT_MS = 2000;

/** One pool per database URL and warm instance, shared by the counts and sign-in. */
const dbs = new Map<string, MetricsDb>();

export function connectDb(databaseUrl: string): MetricsDb {
  const cached = dbs.get(databaseUrl);
  if (cached) return cached;
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
  const db = drizzle(pool) as unknown as MetricsDb;
  dbs.set(databaseUrl, db);
  return db;
}

export function postgresStore(databaseUrl: string) {
  return new DrizzleMetricsStore(connectDb(databaseUrl));
}
