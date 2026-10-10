import { describe, expect, it } from "vitest";
import { call } from "./http";

describe("GET /health", () => {
  it('answers 200 {"ok":true}', async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /cases", () => {
  it("answers 200 with a non-empty list of CaseSummary", async () => {
    const res = await call("/cases");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/);
    const json = await res.json();
    expect(Object.keys(json)).toEqual(["cases"]);
    expect(Array.isArray(json.cases)).toBe(true);
    expect(json.cases.length).toBeGreaterThan(0);

    for (const c of json.cases) {
      // Only the picker fields. Anything else may leak the role brief.
      expect(Object.keys(c).sort(), `case ${c.id}`).toEqual(["id", "school", "summary", "title"]);
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.school).toBe("cbt");
      for (const field of ["title", "summary"]) {
        expect(Object.keys(c[field]).sort(), `${c.id}.${field}`).toEqual(["en", "zh"]);
        expect(typeof c[field].zh).toBe("string");
        expect(typeof c[field].en).toBe("string");
        expect(c[field].zh.trim().length, `${c.id}.${field}.zh`).toBeGreaterThan(0);
        expect(c[field].en.trim().length, `${c.id}.${field}.en`).toBeGreaterThan(0);
      }
    }
    const ids = json.cases.map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
