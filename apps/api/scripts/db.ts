// A database connection for the commands. DATABASE_URL_UNPOOLED (Neon's direct URL) if set,
// else DATABASE_URL. Run with the production env by the lead, like migrations.
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import type { MetricsDb } from "../src/metrics/store.js";

export async function withDb<T>(run: (db: MetricsDb) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED).");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    return await run(drizzle(pool) as unknown as MetricsDb);
  } finally {
    await pool.end();
  }
}

/** --name value pairs. */
export function flags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}
