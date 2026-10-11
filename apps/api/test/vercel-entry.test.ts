// The Vercel entry (api/index.js) only passes on the HTTP methods it exports; any other method is a
// 405 from Vercel and never reaches Hono. The other tests call app.request() and go around this
// file, so a missing export (DELETE /me, 2026-10-11) only showed in production. Here we read the
// file and the route registrations, and check every method a route uses is exported.
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const entry = fs.readFileSync(path.join(root, "api/index.js"), "utf8");
const exported = new Set([...entry.matchAll(/^export const (\w+) = handler;$/gm)].map((m) => m[1]));

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : p.endsWith(".ts") ? [p] : [];
  });
}

// `app.get("/x", …)`, `routes.delete("/me", …)` and the like, anywhere under src/.
const used = new Set<string>();
for (const file of sources(path.join(root, "src"))) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/\.(get|post|put|patch|delete|options|head|all)\(\s*["'`]\//g)) used.add(m[1]!.toUpperCase());
}

describe("Vercel entry api/index.js", () => {
  it("finds the routes it checks", () => {
    // Guards the regex: if it stopped matching, the next test would pass on nothing.
    for (const m of ["GET", "POST", "DELETE"]) expect(used).toContain(m);
  });

  it("exports every method a route uses", () => {
    const needed = used.has("ALL") ? ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] : [...used];
    for (const m of needed) expect(exported, `api/index.js must export ${m}`).toContain(m);
  });

  it("exports HEAD and OPTIONS (Hono answers them; Vercel would 405)", () => {
    expect(exported).toContain("HEAD");
    expect(exported).toContain("OPTIONS");
  });
});
