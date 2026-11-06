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

    const required = ["id", "school", "summary", "title"];
    const optional = ["tags", "difficulty", "estimatedMinutes", "clientAlias", "clientIntro", "practiceFocus", "contentNotes", "sessions", "followUps"];
    const localized = (v: unknown, where: string) => {
      const t = v as Record<string, unknown>;
      expect(Object.keys(t ?? {}).sort(), where).toEqual(["en", "zh"]);
      for (const l of ["zh", "en"]) {
        expect(typeof t[l], `${where}.${l}`).toBe("string");
        expect((t[l] as string).trim().length, `${where}.${l}`).toBeGreaterThan(0);
      }
    };
    for (const c of json.cases) {
      // Only the public fields. Anything else may leak the role brief.
      const keys = Object.keys(c);
      for (const k of required) expect(keys, `case ${c.id}`).toContain(k);
      for (const k of keys) expect([...required, ...optional], `case ${c.id} has unexpected field ${k}`).toContain(k);
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.school).toBe("cbt");
      for (const field of ["title", "summary"]) localized(c[field], `${c.id}.${field}`);
      // Optional fields: when present, well-formed.
      if ("tags" in c) {
        expect(Array.isArray(c.tags) && c.tags.length >= 1 && c.tags.length <= 3, `${c.id}.tags`).toBe(true);
        c.tags.forEach((t: unknown, i: number) => localized(t, `${c.id}.tags[${i}]`));
      }
      if ("difficulty" in c) expect(["intro", "medium", "hard"], `${c.id}.difficulty`).toContain(c.difficulty);
      if ("estimatedMinutes" in c) {
        expect(Number.isInteger(c.estimatedMinutes), `${c.id}.estimatedMinutes`).toBe(true);
        expect(c.estimatedMinutes).toBeGreaterThanOrEqual(1);
        expect(c.estimatedMinutes).toBeLessThanOrEqual(180);
      }
      if ("clientAlias" in c) localized(c.clientAlias, `${c.id}.clientAlias`);
      if ("clientIntro" in c) localized(c.clientIntro, `${c.id}.clientIntro`);
      if ("contentNotes" in c) localized(c.contentNotes, `${c.id}.contentNotes`);
      if ("practiceFocus" in c) {
        expect(Array.isArray(c.practiceFocus) && c.practiceFocus.length >= 1 && c.practiceFocus.length <= 3, `${c.id}.practiceFocus`).toBe(true);
        c.practiceFocus.forEach((t: unknown, i: number) => localized(t, `${c.id}.practiceFocus[${i}]`));
      }
      // Follow-up sessions (ADR 0014). Older servers leave sessions out: one session.
      if ("sessions" in c) {
        expect(Number.isInteger(c.sessions) && c.sessions >= 1 && c.sessions <= 6, `${c.id}.sessions`).toBe(true);
      }
      if ("followUps" in c) {
        expect(Array.isArray(c.followUps) && c.followUps.length >= 1, `${c.id}.followUps`).toBe(true);
        c.followUps.forEach((f: Record<string, unknown>, i: number) => {
          const where = `${c.id}.followUps[${i}]`;
          expect(Number.isInteger(f.session) && (f.session as number) >= 2 && (f.session as number) <= (c.sessions ?? 1), `${where}.session`).toBe(true);
          for (const k of Object.keys(f)) expect(["session", "clientIntro", "practiceFocus"], `${where} has unexpected field ${k}`).toContain(k);
          if ("clientIntro" in f) localized(f.clientIntro, `${where}.clientIntro`);
          if ("practiceFocus" in f) (f.practiceFocus as unknown[]).forEach((t, j) => localized(t, `${where}.practiceFocus[${j}]`));
        });
      }
    }
    const ids = json.cases.map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
