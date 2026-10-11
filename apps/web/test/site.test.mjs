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
      if (tag === "link" && /rel="(alternate|canonical)"/.test(m[0])) continue; // links to our own site, not loads
      assert.ok(!/^(https?:)?\/\//.test(url), `${p}: ${tag} loads ${url}`);
    }
    assert.ok(!/fonts\.googleapis|googletagmanager|google-analytics|plausible|vercel-insights|_vercel\/insights/.test(html), `${p}: tracker`);
    assert.ok(!/document\.cookie|sessionStorage|indexedDB/.test(html), `${p}: storage`);
    // The one thing kept in the browser: the language a visitor picked (landing.md).
    for (const m of html.matchAll(/localStorage\.(\w+)\(([^,)]*)/g)) assert.equal(m[2], '"lang"', `${p}: localStorage ${m[0]}`);
  }
});

test("the privacy page is the policy, nothing else", () => {
  const zh = read("zh/privacy/index.html");
  const en = read("en/privacy/index.html");
  assert.match(zh, /<h2>这是什么<\/h2>/);
  assert.match(zh, /生效日期：/);
  assert.match(zh, /草稿，正式版上架前发布。/);
  assert.match(en, /Draft\. The final version is published before launch\./);
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

test("home and delete pages follow the spec: copy, mailto subjects, search and sharing", () => {
  const zh = read("zh/index.html");
  const en = read("en/index.html");
  assert.match(zh, /和 AI 来访者练一场，再听听督导怎么说/);
  assert.match(en, /Practise with an AI client\. Then hear what a supervisor would say\./);
  assert.ok(zh.includes(`mailto:info@novawerk.io?subject=${encodeURIComponent("加入聆镜 PSYGYM 内测")}`));
  assert.ok(read("en/delete-account/index.html").includes(`mailto:info@novawerk.io?subject=${encodeURIComponent("Delete my 聆镜 PSYGYM account")}`));
  for (const p of ["zh/index.html", "en/index.html", "zh/delete-account/index.html", "en/delete-account/index.html", "zh/privacy/index.html"]) {
    const html = read(p);
    assert.doesNotMatch(html, /name="robots" content="noindex"/, `${p} must be findable`);
    assert.match(html, /hreflang="x-default"/, p);
    assert.match(html, /rel="canonical" href="https:\/\/psygym\.novawerk\.io\//, p);
    assert.match(html, /property="og:image" content="https:\/\/psygym\.novawerk\.io\/og-(zh|en)\.png"/, p);
  }
  assert.ok(fs.existsSync(path.join(dist, "og-zh.png")) && fs.existsSync(path.join(dist, "og-en.png")), "og images");
});
