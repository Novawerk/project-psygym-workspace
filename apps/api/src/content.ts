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

const Localized = z.object({ zh: z.string().min(1), en: z.string().min(1) });
const Frontmatter = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  school: z.literal("cbt"),
  title: Localized,
  summary: Localized,
});

export type CaseSummary = z.infer<typeof Frontmatter>;
export interface Case extends CaseSummary {
  /** The AI's role brief. Stays on the server. */
  brief: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseCase(file: string, raw: string): Case {
  const m = FRONTMATTER.exec(raw);
  if (!m) throw new Error(`${file}: missing frontmatter`);
  const meta = Frontmatter.safeParse(parseYaml(m[1]!));
  if (!meta.success) throw new Error(`${file}: bad frontmatter\n${z.prettifyError(meta.error)}`);
  return { ...meta.data, brief: m[2]!.trim() };
}

export function loadCases(dir = path.join(contentDir(), "cases")): Map<string, Case> {
  const cases = new Map<string, Case>();
  // Sorted by id, so "x" comes before "x-more" (plain filename order puts "-" before ".md").
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".md"))
    .map((n) => n.slice(0, -3))
    .sort()
    .map((n) => `${n}.md`);
  for (const name of names) {
    const c = parseCase(name, fs.readFileSync(path.join(dir, name), "utf8"));
    if (cases.has(c.id)) throw new Error(`${name}: duplicate case id ${c.id}`);
    cases.set(c.id, c);
  }
  return cases;
}

export interface Prompts {
  client: string;
  supervisor: string;
  /** Supervision rubric per school, without its frontmatter. */
  rubrics: Record<CaseSummary["school"], string>;
}

const read = (file: string) => fs.readFileSync(file, "utf8").trim();
const stripFrontmatter = (raw: string) => FRONTMATTER.exec(raw)?.[2]?.trim() ?? raw;

export function loadPrompts(dir = promptsDir(), content = contentDir()): Prompts {
  return {
    client: read(path.join(dir, "client.md")),
    supervisor: read(path.join(dir, "supervisor.md")),
    rubrics: { cbt: stripFrontmatter(read(path.join(content, "rubrics/cbt.md"))) },
  };
}
