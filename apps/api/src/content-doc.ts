// One case or rubric as a whole Markdown file (`source`), the way the database stores it
// (docs/decisions/0009-admin-phase1.md): the checks a publish must pass, the parsed frontmatter
// for the admin's form, and merging an edited frontmatter back into the YAML without losing
// its comments. No database code here: the app, the admin and the scripts all use it.
import { isDeepStrictEqual } from "node:util";

import { Document, parse as parseYaml, parseDocument } from "yaml";
import { FRONTMATTER, Required, SCHOOLS, parseCase, rubricForPrompt, rubricProblems, stripComments, type Case, type Problem } from "./content.js";

export { SCHOOLS, type Problem };

export type Kind = "case" | "rubric";
export const KINDS: readonly Kind[] = ["case", "rubric"];
/** content/README.md: lower-case letters, digits and hyphens; never changes. */
export const CASE_ID = /^[a-z0-9-]{3,64}$/;
export const MAX_SOURCE_BYTES = 200 * 1024;

export interface Split {
  frontmatter: Record<string, unknown> | null;
  /** The YAML text between the fences, as written. */
  yaml: string;
  body: string;
}

/** The parts of a source; null when it has no frontmatter fences at all. */
export function split(source: string): Split | null {
  const m = FRONTMATTER.exec(source);
  if (!m) return null;
  let frontmatter: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = parseYaml(m[1]!);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) frontmatter = parsed as Record<string, unknown>;
  } catch {
    frontmatter = null;
  }
  return { frontmatter, yaml: m[1]!, body: m[2]! };
}

/** The whole file again. split(join(...)) gives the same parts back. */
export const join = (yaml: string, body: string) => `---\n${yaml.replace(/\n+$/, "")}\n---\n${body}`;

/**
 * An edited frontmatter (JSON from the admin's form) merged into the stored YAML: keys whose
 * value didn't change keep their text and comments; changed keys are replaced, removed keys
 * dropped, new keys added at the end. With no stored source, a fresh YAML document.
 */
export function withFrontmatter(old: string | null, frontmatter: Record<string, unknown>, body: string): string {
  const prev = old ? split(old) : null;
  if (!prev || !prev.frontmatter) return join(new Document(frontmatter).toString(), body);
  if (isDeepStrictEqual(prev.frontmatter, frontmatter)) return join(prev.yaml, body);
  const doc = parseDocument(prev.yaml);
  for (const key of Object.keys(prev.frontmatter)) if (!(key in frontmatter)) doc.delete(key);
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!isDeepStrictEqual(prev.frontmatter[key], value)) doc.set(key, value);
  }
  return join(doc.toString(), body);
}

export interface Checked {
  errors: Problem[];
  warnings: Problem[];
}

const issuePath = (path: PropertyKey[]) => ["frontmatter", ...path.map(String)].join(".");

function sizeProblem(source: string): Problem | null {
  return Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES ? { path: "source", message: `longer than ${MAX_SOURCE_BYTES / 1024} KB` } : null;
}

/** A case's source, checked as content/ is at load time, plus: its id is the one in the path. */
export function checkCase(id: string, source: string): Checked & { value?: Case } {
  const too = sizeProblem(source);
  if (too) return { errors: [too], warnings: [] };
  const parts = split(source);
  if (!parts) return { errors: [{ path: "source", message: "missing the --- frontmatter --- block" }], warnings: [] };
  if (!parts.frontmatter) return { errors: [{ path: "frontmatter", message: "not valid YAML" }], warnings: [] };
  const errors: Problem[] = [];
  const required = Required.safeParse(parts.frontmatter);
  if (!required.success) for (const issue of required.error.issues) errors.push({ path: issuePath(issue.path), message: issue.message });
  if (parts.frontmatter.id !== id) errors.push({ path: "frontmatter.id", message: `must be "${id}"` });
  try {
    stripComments(parts.body);
  } catch (e) {
    errors.push({ path: "body", message: (e as Error).message });
  }
  if (errors.length) return { errors, warnings: [] };
  const warnings: Problem[] = [];
  const value = parseCase("frontmatter", source, (m) => {
    const key = /^frontmatter: (\w+)/.exec(m)?.[1];
    warnings.push({ path: key ? `frontmatter.${key}` : "frontmatter", message: m.replace(/^frontmatter: /, "") });
  });
  return { errors, warnings, value };
}

/** A rubric's source: the shared rules in rubricProblems. `value` is what the supervisor reads. */
export function checkRubric(id: string, source: string): Checked & { value?: string } {
  const too = sizeProblem(source);
  if (too) return { errors: [too], warnings: [] };
  const errors = rubricProblems(id, source);
  return errors.length ? { errors, warnings: [] } : { errors, warnings: [], value: rubricForPrompt(source) };
}

export const check = (kind: Kind, id: string, source: string): Checked => (kind === "case" ? checkCase(id, source) : checkRubric(id, source));

const LOCALIZED_FIELDS = ["title", "summary", "clientAlias", "clientIntro", "contentNotes"];
const LOCALIZED_LISTS = ["tags", "practiceFocus"];

const missingEn = (v: unknown) => {
  if (!v || typeof v !== "object") return false;
  const o = v as { zh?: unknown; en?: unknown };
  return typeof o.zh === "string" && o.zh.trim() !== "" && !(typeof o.en === "string" && o.en.trim() !== "");
};

/** A case field with Chinese but no English (the app shows the Chinese then). */
export function enMissing(kind: Kind, source: string): boolean {
  if (kind !== "case") return false;
  const fm = split(source)?.frontmatter;
  if (!fm) return false;
  return (
    LOCALIZED_FIELDS.some((k) => missingEn(fm[k])) ||
    LOCALIZED_LISTS.some((k) => Array.isArray(fm[k]) && (fm[k] as unknown[]).some(missingEn))
  );
}

/** The title for lists: { zh, en | null }. Rubrics have one too. */
export function titleOf(source: string): { zh: string; en: string | null } {
  const t = split(source)?.frontmatter?.title as { zh?: unknown; en?: unknown } | undefined;
  const zh = typeof t?.zh === "string" ? t.zh : "";
  const en = typeof t?.en === "string" && t.en.trim() ? t.en : null;
  return { zh, en };
}
