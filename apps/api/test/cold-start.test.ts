// With counting off, a cold start must not load drizzle-orm or pg (they cost 150–350 ms).
// Each case starts a fresh Node process that imports src/index.ts the way the server does.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loaded(env: Record<string, string>): { db: number; auth: number } {
  const out = execFileSync(
    process.execPath,
    ["--import", "tsx", "--import", "./test/fixtures/trace-modules.mjs", "--input-type=module", "-e", "await import('./src/index.ts');"],
    { cwd: root, env: { PATH: process.env.PATH ?? "", LLM_PROVIDER: "mock", ...env }, encoding: "utf8" },
  );
  const db = /DB_MODULES (\d+)/.exec(out);
  const auth = /AUTH_MODULES (\d+)/.exec(out);
  if (!db || !auth) throw new Error(`no trace in output:\n${out}`);
  return { db: Number(db[1]), auth: Number(auth[1]) };
}
const dbModulesLoaded = (env: Record<string, string>) => loaded(env).db;

// module.registerHooks arrived in Node 22.15 / 23.5.
describe.skipIf(typeof registerHooks !== "function")("cold start", () => {
  it("counting off: drizzle-orm and pg are never loaded", () => {
    expect(dbModulesLoaded({})).toBe(0);
    expect(dbModulesLoaded({ DATABASE_URL: "postgres://u:p@127.0.0.1:1/x" })).toBe(0); // no METRICS_ENABLED
    expect(dbModulesLoaded({ METRICS_ENABLED: "true" })).toBe(0); // no DATABASE_URL
  }, 60_000);

  it("sign-in off (the default): no auth module and no database code", () => {
    expect(loaded({})).toEqual({ db: 0, auth: 0 });
    // AUTH_MODE=on without AUTH_SECRET stays off.
    expect(loaded({ AUTH_MODE: "on", DATABASE_URL: "postgres://u:p@127.0.0.1:1/x" })).toEqual({ db: 0, auth: 0 });
  }, 60_000);

  it("sign-in on: the auth module and the database code load", () => {
    const l = loaded({ AUTH_MODE: "on", DATABASE_URL: "postgres://u:p@127.0.0.1:1/x", AUTH_SECRET: "s".repeat(40) });
    expect(l.db).toBeGreaterThan(0);
    expect(l.auth).toBeGreaterThan(0);
  }, 60_000);

  it("counting on: they are (so the check above can see them)", () => {
    expect(dbModulesLoaded({ METRICS_ENABLED: "true", DATABASE_URL: "postgres://u:p@127.0.0.1:1/x" })).toBeGreaterThan(0);
  }, 60_000);
});
