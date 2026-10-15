// CONTENT_SOURCE=db: the cache in front of the published versions (src/content-source.ts).
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Logger } from "../src/app.js";
import { contentDir, loadCases, loadPrompts } from "../src/content.js";
import { split, withFrontmatter } from "../src/content-doc.js";
import { cachedContent, type PublishedRow } from "../src/content-source.js";

const cases = loadCases();
const prompts = loadPrompts();
const bundle = { cases, rubrics: prompts.rubrics, versions: new Map<string, number>() };
const CASE = "cbt-depression-anxiety-01";
const raw = fs.readFileSync(path.join(contentDir(), `cases/${CASE}.md`), "utf8");
const renamed = (title: string) => raw.replace(/^  zh: 家事耗竭与择业迷茫$/m, `  zh: ${title}`);
const row = (source: string, version = 2): PublishedRow => ({ kind: "case", id: CASE, version, source });

function source(loads: (() => Promise<PublishedRow[]>)[]) {
  let now = 0;
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const pending: Promise<unknown>[] = [];
  let calls = 0;
  const content = cachedContent({
    bundle,
    load: () => loads[Math.min(calls++, loads.length - 1)]!(),
    logger,
    now: () => now,
    keepAlive: (p) => pending.push(p),
    firstWaitMs: 50,
  });
  return { content, lines, pending, calls: () => calls, tick: (ms: number) => (now += ms) };
}

describe("cachedContent", () => {
  it("first request waits for the database; then a minute from memory, refreshed in the background", async () => {
    const s = source([async () => [row(renamed("一"))], async () => [row(renamed("二"), 3)]]);
    const first = await s.content.current();
    expect(first.cases.get(CASE)!.title.zh).toBe("一");
    expect(first.versions.get(`case:${CASE}`)).toBe(2);
    s.tick(59_000);
    expect((await s.content.current()).cases.get(CASE)!.title.zh).toBe("一");
    expect(s.calls()).toBe(1);
    s.tick(1000);
    // Stale: this request still gets the copy it has; the refresh runs behind it.
    expect((await s.content.current()).cases.get(CASE)!.title.zh).toBe("一");
    await Promise.all(s.pending);
    expect((await s.content.current()).cases.get(CASE)!.title.zh).toBe("二");
  });

  it("a slow first load: the bundle now, the database's result for the next request", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = source([async () => (await gate, [row(renamed("慢"))])]);
    expect((await s.content.current()).cases.get(CASE)!.title.zh).toBe("家事耗竭与择业迷茫");
    release();
    await Promise.all(s.pending);
    expect((await s.content.current()).cases.get(CASE)!.title.zh).toBe("慢");
  });

  it("a failed load keeps the last good copy; never failed requests", async () => {
    const s = source([async () => [row(renamed("好"))], async () => Promise.reject(new TypeError("connection refused"))]);
    await s.content.current();
    s.tick(60_000);
    await s.content.current();
    await Promise.all(s.pending);
    expect((await s.content.current()).cases.get(CASE)!.title.zh).toBe("好");
    expect(s.lines.some((l) => l.msg === "content: load failed" && l.error === "TypeError")).toBe(true);
  });

  it("no published case (import not run): the bundle, logged once", async () => {
    const s = source([async () => []]);
    expect((await s.content.current()).cases).toBe(cases);
    expect(s.lines.filter((l) => String(l.msg).includes("no published case"))).toHaveLength(1);
  });

  it("a version that doesn't parse keeps the item's last good version", async () => {
    const s = source([async () => [row(renamed("好"))], async () => [row("broken", 3)]]);
    await s.content.current();
    await s.content.refresh();
    const snap = await s.content.current();
    expect(snap.cases.get(CASE)!.title.zh).toBe("好");
    expect(snap.versions.get(`case:${CASE}`)).toBe(2);
  });

  it("refresh after a publish waits for a load already running, then loads again", async () => {
    const s = source([async () => [row(renamed("旧"))], async () => [row(renamed("新"), 3)]]);
    await s.content.current();
    await s.content.refresh();
    expect((await s.content.current()).cases.get(CASE)!.title.zh).toBe("新");
  });
});

describe("withFrontmatter", () => {
  it("keeps comments and order for keys that didn't change", () => {
    const old = "---\nid: x\n# a note\ntitle:\n  zh: 甲\nschool: cbt\n---\nbody\n";
    const fm = split(old)!.frontmatter!;
    expect(withFrontmatter(old, fm, "body\n")).toBe(old);
    const out = withFrontmatter(old, { ...fm, title: { zh: "乙" } }, "body\n");
    expect(out).toContain("# a note");
    expect(out.indexOf("title")).toBeLessThan(out.indexOf("school"));
    expect(split(out)!.frontmatter).toEqual({ id: "x", title: { zh: "乙" }, school: "cbt" });
    expect(split(withFrontmatter(old, { id: "x" }, "b"))!.frontmatter).toEqual({ id: "x" });
  });
});
