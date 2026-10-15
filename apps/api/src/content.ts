// Cases (content/cases/<id>.md), the supervision rubric (content/rubrics/cbt.md) and our prompts
// (apps/api/prompts/*.md), read once per process.
//
// In dev (tsx) we read them from the repo. The build (tsup) copies them next to the bundle, as
// dist/content/{cases,rubrics} and dist/prompts, so the Vercel Function finds them too.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));

function firstDir(candidates: string[]): string {
  const found = candidates.find((d) => fs.existsSync(d));
  if (!found) throw new Error(`None of these folders exist: ${candidates.join(", ")}`);
  return found;
}

export const contentDir = () =>
  process.env.CONTENT_DIR ?? firstDir([path.join(here, "content"), path.resolve(here, "../../../content")]);
export const promptsDir = () =>
  process.env.PROMPTS_DIR ?? firstDir([path.join(here, "prompts"), path.resolve(here, "../prompts")]);

/**
 * Case authors may write Chinese first. `zh` is required; an empty or missing `en` falls back to
 * `zh`, so the app always gets both.
 */
const Localized = z
  .object({ zh: z.string().trim().min(1), en: z.string().trim().nullish() })
  .transform(({ zh, en }) => ({ zh, en: en || zh }));
export type LocalizedText = z.infer<typeof Localized>;

/** Required: a case without these doesn't load. */
export const Required = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  school: z.literal("cbt"),
  title: Localized,
  summary: Localized,
});

/** The template lets 聆镜 write difficulty in Chinese. */
const DIFFICULTY: Record<string, "intro" | "medium" | "hard"> = { 入门: "intro", 中等: "medium", 较难: "hard" };

/** Whole minutes; a number, or a string of digits ("20"). Never true/false or other coercions. */
const Minutes = z.preprocess((v) => (typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : v), z.number().int().min(1).max(180));

/**
 * Optional, public (GET /cases only, never sent to a model as the supervisor's input; the
 * client's alias also goes to the AI client as its own name).
 * Each one is checked on its own: a bad value drops that field with a warning, and the case
 * still loads. A missing field is simply left out of the response.
 */
const Optional = {
  tags: z.array(Localized).min(1),
  difficulty: z.preprocess((v) => (typeof v === "string" ? (DIFFICULTY[v.trim()] ?? v.trim()) : v), z.enum(["intro", "medium", "hard"])),
  estimatedMinutes: Minutes,
  clientAlias: Localized,
  clientIntro: Localized,
  practiceFocus: z.array(Localized).min(1),
  contentNotes: Localized,
} as const;
type OptionalKey = keyof typeof Optional;
/**
 * List fields share one rule: a bad entry is dropped (with a warning), the rest stay; past the
 * limit we keep the first ones (with a warning); with no good entry left the field is left out.
 */
const LIST_LIMITS: Partial<Record<OptionalKey, number>> = { tags: 3, practiceFocus: 3 };
export const OPTIONAL_FIELDS = Object.keys(Optional) as OptionalKey[];

export type CaseSummary = z.infer<typeof Required> & { [K in OptionalKey]?: z.infer<(typeof Optional)[K]> };
export interface Case extends CaseSummary {
  /** The AI's role brief. Stays on the server. */
  brief: string;
}

/** Only the public fields, in a fixed order; missing optional ones are left out. */
export function publicSummary(c: Case): CaseSummary {
  const out: CaseSummary = { id: c.id, school: c.school, title: c.title, summary: c.summary };
  for (const key of OPTIONAL_FIELDS) if (c[key] !== undefined) Object.assign(out, { [key]: c[key] });
  return out;
}

export const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export type Warn = (message: string) => void;
const consoleWarn: Warn = (m) => console.warn(JSON.stringify({ msg: "case warning", warning: m }));

export function parseCase(file: string, raw: string, warn: Warn = consoleWarn): Case {
  const m = FRONTMATTER.exec(raw);
  if (!m) throw new Error(`${file}: missing frontmatter`);
  const yaml: unknown = parseYaml(m[1]!);
  const meta = Required.safeParse(yaml);
  if (!meta.success) throw new Error(`${file}: bad frontmatter\n${z.prettifyError(meta.error)}`);
  let brief: string;
  try {
    brief = stripComments(m[2]!);
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`);
  }
  const c: Case = { ...meta.data, brief };
  const fields = (yaml ?? {}) as Record<string, unknown>;
  for (const key of OPTIONAL_FIELDS) {
    let input = fields[key];
    if (input === undefined || input === null) continue;
    const limit = LIST_LIMITS[key];
    if (limit !== undefined && Array.isArray(input)) {
      const good = input.filter((item, i) => {
        const ok = Localized.safeParse(item).success;
        if (!ok) warn(`${file}: ${key}[${i}] is invalid and left out`);
        return ok;
      });
      if (good.length > limit) warn(`${file}: ${key} has ${good.length} entries; keeping the first ${limit}`);
      input = good.slice(0, limit);
    }
    const parsed = Optional[key].safeParse(input);
    if (parsed.success) Object.assign(c, { [key]: parsed.data });
    else warn(`${file}: ${key} is invalid and left out (${parsed.error.issues[0]?.message ?? "invalid"})`);
  }
  return c;
}

export function loadCases(dir = path.join(contentDir(), "cases"), warn: Warn = consoleWarn): Map<string, Case> {
  const cases = new Map<string, Case>();
  // Sorted by id, so "x" comes before "x-more" (plain filename order puts "-" before ".md").
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".md"))
    .map((n) => n.slice(0, -3))
    .sort()
    .map((n) => `${n}.md`);
  for (const name of names) {
    const c = parseCase(name, fs.readFileSync(path.join(dir, name), "utf8"), warn);
    if (cases.has(c.id)) throw new Error(`${name}: duplicate case id ${c.id}`);
    cases.set(c.id, c);
  }
  return cases;
}

export interface Prompts {
  client: string;
  supervisor: string;
  /** Mid-session notes (/supervision with mode "live"). */
  supervisorLive: string;
  /** Checks an end_session call (src/end-judge.ts, END_SESSION_JUDGE). */
  endJudge: string;
  /** Supervision rubric per school, without its frontmatter. */
  rubrics: Record<CaseSummary["school"], string>;
}

const read = (file: string) => fs.readFileSync(file, "utf8").trim();
export const stripFrontmatter = (raw: string) => FRONTMATTER.exec(raw)?.[2]?.trim() ?? raw;

/**
 * Notes for us and for 聆镜 (<!-- … -->) never reach a model. An unclosed one would send the
 * rest of the file as is, so it fails the load (and CI) instead.
 */
export function stripComments(text: string): string {
  const stripped = text.replace(/<!--[\s\S]*?-->/g, "");
  if (stripped.includes("<!--") || stripped.includes("-->")) throw new Error("unclosed HTML comment");
  return stripped.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Skill ids 聆镜 wrote → the ids we had already fixed. The app's shield and skill-tags.md use
 * risk_screening, so the model only ever sees that one.
 */
export const SKILL_ALIASES: Record<string, string> = { initial_assessment_and_safety: "risk_screening" };

/** Rubric sections we don't send: the report's shape and length come from prompts/supervisor.md. */
const RUBRIC_DROPPED_SECTIONS = ["报告结构"];

const SKILL_ID_LINE = /^([ \t]*-[ \t]*技能 id：[ \t]*)([a-z0-9_]+)[ \t]*$/gm;

/** The skill ids in a rubric, in order, after aliasing. */
export function rubricSkillIds(rubric: string): string[] {
  return [...rubric.matchAll(SKILL_ID_LINE)].map((m) => SKILL_ALIASES[m[2]!] ?? m[2]!);
}

/** A rubric file as the supervisor reads it: no frontmatter, no comments, no dropped sections, aliased ids. */
export function rubricForPrompt(raw: string): string {
  const sections = stripComments(stripFrontmatter(raw)).split(/^(?=## )/m);
  return sections
    .filter((s) => !RUBRIC_DROPPED_SECTIONS.some((title) => s.startsWith(`## ${title}`)))
    .join("")
    .replace(SKILL_ID_LINE, (_, head: string, id: string) => `${head}${SKILL_ALIASES[id] ?? id}`)
    .trim();
}

/** Rubric ids are schools. Phase 1 has one. */
export const SCHOOLS = ["cbt"] as const;

export interface Problem {
  path: string;
  message: string;
}

/**
 * Everything a rubric file must pass, wherever it comes from: content/ at start, the import,
 * a publish or rollback in the admin (docs/decisions/0009-admin-phase1.md), and the tests.
 * A known school as id; frontmatter id and school match it; comments closed; every numbered
 * point (### 1.) has a skill id; ids unique; risk_screening among them (after the aliases).
 */
export function rubricProblems(id: string, raw: string): Problem[] {
  const problems: Problem[] = [];
  if (!(SCHOOLS as readonly string[]).includes(id)) problems.push({ path: "id", message: `unknown school; known: ${SCHOOLS.join(", ")}` });
  const m = FRONTMATTER.exec(raw);
  if (!m) return [...problems, { path: "source", message: "missing the --- frontmatter --- block" }];
  let parsed: unknown = null;
  try {
    parsed = parseYaml(m[1]!);
  } catch {
    problems.push({ path: "frontmatter", message: "not valid YAML" });
  }
  const meta = parsed && typeof parsed === "object" ? (parsed as { id?: unknown; school?: unknown }) : null;
  if (meta) {
    if (meta.id !== id) problems.push({ path: "frontmatter.id", message: `must be "${id}"` });
    if (meta.school !== id) problems.push({ path: "frontmatter.school", message: `must be "${id}"` });
  }
  let body: string;
  try {
    body = stripComments(m[2]!);
  } catch (e) {
    return [...problems, { path: "body", message: (e as Error).message }];
  }
  const ids = rubricSkillIds(body);
  const points = body.match(/^### \d+\./gm) ?? [];
  if (ids.length === 0) problems.push({ path: "body", message: "no skill ids (lines like「- 技能 id：risk_screening」)" });
  else {
    if (points.length !== ids.length) problems.push({ path: "body", message: `${points.length} numbered points (### 1.) but ${ids.length} skill ids` });
    const dup = ids.find((x, i) => ids.indexOf(x) !== i);
    if (dup) problems.push({ path: "body", message: `skill id ${dup} appears twice` });
    if (!ids.includes("risk_screening")) problems.push({ path: "body", message: "needs the skill id risk_screening" });
  }
  return problems;
}

/** Across items: every case's school needs a rubric. The ids of cases whose school has none. */
export function casesWithoutRubric(cases: Map<string, Case>, rubrics: Partial<Record<string, string>>): string[] {
  return [...cases.values()].filter((c) => !rubrics[c.school]).map((c) => c.id);
}

/** The bundled rubrics, each checked; a bad one stops the start (and CI). */
function loadRubrics(content: string): Prompts["rubrics"] {
  const out: Partial<Prompts["rubrics"]> = {};
  for (const school of SCHOOLS) {
    const raw = read(path.join(content, `rubrics/${school}.md`));
    const problems = rubricProblems(school, raw);
    if (problems.length) throw new Error(`rubrics/${school}.md: ${problems.map((p) => `${p.path}: ${p.message}`).join("; ")}`);
    out[school] = rubricForPrompt(raw);
  }
  return out as Prompts["rubrics"];
}

export function loadPrompts(dir = promptsDir(), content = contentDir()): Prompts {
  return {
    client: read(path.join(dir, "client.md")),
    supervisor: read(path.join(dir, "supervisor.md")),
    supervisorLive: read(path.join(dir, "supervisor-live.md")),
    endJudge: read(path.join(dir, "end-judge.md")),
    rubrics: loadRubrics(content),
  };
}
