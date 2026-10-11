// The privacy policy page renders docs/release/privacy-policy.md, the one source of truth.
// We take the "## 中文" or "## English" section only: the draft note at the top and the
// internal "正式上架前要解决" section are not part of the policy.
import fs from "node:fs";
import path from "node:path";

import { marked } from "marked";

import type { Locale } from "./i18n";

// Resolved from the app's folder (apps/web), where astro and the tests run.
export const POLICY_FILE = path.resolve(process.cwd(), "../../docs/release/privacy-policy.md");
const REPO_BLOB = "https://github.com/Novawerk/project-psygym-workspace/blob/main/docs/release/";
const HEADING: Record<Locale, string> = { zh: "## 中文", en: "## English" };

/** The section under the language's "## " heading, up to the next "## " heading. */
export function policySection(markdown: string, locale: Locale): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() === HEADING[locale]);
  if (start < 0) throw new Error(`privacy-policy.md has no "${HEADING[locale]}" section`);
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .replace(/\n---\s*$/, "")
    .trim();
}

/** Relative links in the policy point into the repo; on the site they go to GitHub. */
export function absoluteLinks(md: string): string {
  return md.replace(/\]\((\.{1,2}\/[^)\s]+)\)/g, (_, rel: string) => `](${new URL(rel, REPO_BLOB).href})`);
}

export function policyHtml(locale: Locale, markdown = fs.readFileSync(POLICY_FILE, "utf8")): string {
  // "### " becomes "## ", so the page has one h1 (its title) with the sections under it.
  const section = absoluteLinks(policySection(markdown, locale)).replace(/^### /gm, "## ");
  return marked.parse(section, { async: false }) as string;
}
