// Checks the built site (dist/). Run after `astro build`: `pnpm test`.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const dist = path.resolve(import.meta.dirname, "../dist");
const read = (p) => fs.readFileSync(path.join(dist, p), "utf8");
const pages = fs
  .readdirSync(dist, { recursive: true })
  .filter((f) => String(f).endsWith(".html"))
  .map(String);

test("every page we promise exists, in both languages", () => {
  for (const p of ["index.html", "privacy/index.html", "delete-account/index.html", "404.html"]) assert.ok(pages.includes(p), p);
  for (const l of ["zh", "en"]) for (const p of ["index.html", "privacy/index.html", "delete-account/index.html"]) assert.ok(pages.includes(`${l}/${p}`), `${l}/${p}`);
});

test("nothing loads from another host: no scripts, styles, fonts, images or frames", () => {
  for (const p of pages) {
    const html = read(p);
    for (const m of html.matchAll(/<(script|link|img|iframe|source)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
      const [, tag, url] = m;
      if (tag === "link" && /rel="alternate"/.test(m[0])) continue; // hreflang links to our own site
      assert.ok(!/^(https?:)?\/\//.test(url), `${p}: ${tag} loads ${url}`);
    }
    assert.ok(!/fonts\.googleapis|googletagmanager|google-analytics|plausible|vercel-insights|_vercel\/insights/.test(html), `${p}: tracker`);
    assert.ok(!/document\.cookie|localStorage|sessionStorage/.test(html), `${p}: storage`);
  }
});

test("the privacy page is the policy, nothing else", () => {
  const zh = read("zh/privacy/index.html");
  const en = read("en/privacy/index.html");
  assert.match(zh, /<h2>这是什么<\/h2>/);
  assert.match(en, /<h2>What this is<\/h2>/);
  for (const html of [zh, en]) {
    assert.doesNotMatch(html, /正式上架前要解决/); // the internal to-do section
    assert.doesNotMatch(html, /草稿。标「待定」/); // the draft note at the top
  }
  assert.doesNotMatch(zh, /What this is/);
  assert.doesNotMatch(en, /这是什么/);
  // Relative repo links go to GitHub.
  assert.match(zh, /href="https:\/\/github\.com\/Novawerk\/project-psygym-workspace\/blob\/main\/docs\/release\/README\.md"/);
  assert.doesNotMatch(zh, /href="\.\.?\//);
});

test("bare paths pick a language, with plain links for no JavaScript", () => {
  for (const [p, target] of [["index.html", ""], ["privacy/index.html", "/privacy"], ["delete-account/index.html", "/delete-account"]]) {
    const html = read(p);
    assert.match(html, /location\.replace/);
    assert.ok(html.includes(`href="/zh${target}"`) && html.includes(`href="/en${target}"`), p);
  }
});

test("each page says its language and links to the other one", () => {
  assert.match(read("zh/privacy/index.html"), /<html lang="zh-CN"/);
  assert.match(read("en/privacy/index.html"), /<html lang="en"/);
  assert.match(read("zh/privacy/index.html"), /href="\/en\/privacy"/);
  assert.match(read("en/delete-account/index.html"), /mailto:info@novawerk\.io/);
});
