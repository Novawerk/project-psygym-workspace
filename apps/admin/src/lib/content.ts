// The editor's view of a case or rubric: frontmatter fields as form state, plus the body.
// Field rules follow content/README.md; the backend's checks are the real ones.

import type { Kind, Localized, Problem } from "./types"

export type Pair = { zh: string; en: string }

export type CaseForm = {
  title: Pair
  summary: Pair
  clientAlias: Pair
  tags: Pair[]
  difficulty: "" | "intro" | "medium" | "hard"
  estimatedMinutes: string
  clientIntro: Pair
  practiceFocus: Pair[]
  contentNotes: Pair
}

export type RubricForm = { title: Pair }

export type Form = CaseForm | RubricForm

const EMPTY: Pair = { zh: "", en: "" }

function pair(v: unknown): Pair {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    return { zh: typeof o.zh === "string" ? o.zh : "", en: typeof o.en === "string" ? o.en : "" }
  }
  return { ...EMPTY }
}

const pairs = (v: unknown): Pair[] => (Array.isArray(v) ? v.map(pair) : [])

export function formFromFrontmatter(kind: Kind, fm: Record<string, unknown> | null): Form {
  const f = fm ?? {}
  if (kind === "rubric") return { title: pair(f.title) }
  const d = f.difficulty
  return {
    title: pair(f.title),
    summary: pair(f.summary),
    clientAlias: pair(f.clientAlias),
    tags: pairs(f.tags),
    difficulty: d === "intro" || d === "medium" || d === "hard" ? d : "",
    estimatedMinutes: typeof f.estimatedMinutes === "number" ? String(f.estimatedMinutes) : "",
    clientIntro: pair(f.clientIntro),
    practiceFocus: pairs(f.practiceFocus),
    contentNotes: pair(f.contentNotes),
  }
}

/** Optional pairs drop out when both sides are empty; an empty English side drops its key. */
function out(p: Pair): Record<string, string> | undefined {
  const zh = p.zh.trim()
  const en = p.en.trim()
  if (!zh && !en) return undefined
  return en ? { zh, en } : { zh }
}

/**
 * The frontmatter sent to PUT …/draft: the edited fields merged over what the draft had, so keys
 * the form doesn't show (id, school, anything new) pass through untouched.
 */
export function frontmatterFromForm(
  kind: Kind,
  id: string,
  form: Form,
  base: Record<string, unknown> | null,
): Record<string, unknown> {
  const fm: Record<string, unknown> = { ...(base ?? {}), id }
  const set = (key: string, value: unknown) => {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) delete fm[key]
    else fm[key] = value
  }
  set("title", out(form.title) ?? { zh: "" })
  if (kind === "rubric") return fm
  const f = form as CaseForm
  set("summary", out(f.summary) ?? { zh: "" })
  set("clientAlias", out(f.clientAlias))
  set("tags", f.tags.map(out).filter(Boolean))
  set("difficulty", f.difficulty || undefined)
  const minutes = Number.parseInt(f.estimatedMinutes, 10)
  set("estimatedMinutes", Number.isFinite(minutes) ? minutes : undefined)
  set("clientIntro", out(f.clientIntro))
  set("practiceFocus", f.practiceFocus.map(out).filter(Boolean))
  set("contentNotes", out(f.contentNotes))
  return fm
}

// --- A small YAML writer for the shapes above (preview-chat sources and the sample store). ---

const needsQuotes = (s: string) => s === "" || /^[\s\-?:,[\]{}#&*!|>'"%@`]|[:#]\s|\s$|^(true|false|null|~|\d)/i.test(s)
const scalar = (v: unknown) =>
  typeof v === "string" ? (needsQuotes(v) ? JSON.stringify(v) : v) : JSON.stringify(v)

function yaml(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const inner = yaml(item, `${indent}  `).replace(/^\s+/, "")
          return `${indent}- ${inner}`
        }
        return `${indent}- ${scalar(item)}`
      })
      .join("\n")
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) =>
        v && typeof v === "object" ? `${indent}${k}:\n${yaml(v, `${indent}  `)}` : `${indent}${k}: ${scalar(v)}`,
      )
      .join("\n")
  }
  return `${indent}${scalar(value)}`
}

export function toSource(frontmatter: Record<string, unknown>, body: string) {
  return `---\n${yaml(frontmatter, "")}\n---\n\n${body.replace(/^\n+/, "")}`
}

// --- Outline: the template's headings (content/README.md) and whether the body has them. ---

export const CASE_HEADINGS = [
  "来访者基本情况",
  "主诉",
  "症状表现",
  "认知模式和核心信念",
  "说话风格",
  "常见阻抗",
  "会透露什么、不会轻易透露什么",
  "风险等级与安全边界",
  "备注（可选）",
]

export const RUBRIC_HEADINGS = ["这份标准适用于", "要看的点", "新手常见错误", "好的做法", "安全相关", "报告结构"]

export function outline(kind: Kind, body: string) {
  const present = new Set(
    body
      .split("\n")
      .filter((l) => /^##\s/.test(l))
      .map((l) => l.replace(/^##\s+/, "").trim()),
  )
  const strip = (h: string) => h.replace(/（可选）$/, "")
  return (kind === "case" ? CASE_HEADINGS : RUBRIC_HEADINGS).map((h) => ({
    label: h,
    present: present.has(h) || present.has(strip(h)),
  }))
}

// --- Problems: which field a backend path points at. ---

/** "frontmatter.title.zh" → { field: "title", side: "zh" }; "body" → { field: "body" }. */
export function problemTarget(p: Problem): { field: string; side?: "zh" | "en" } {
  const parts = p.path.split(".")
  if (parts[0] !== "frontmatter") return { field: parts[0] ?? "source" }
  const side = parts.find((x) => x === "zh" || x === "en") as "zh" | "en" | undefined
  return { field: parts[1] ?? "source", side }
}

export const localizedZh = (l: Localized | null | undefined) => l?.zh ?? ""

/** The case's starting text for a new draft, from content/README.md. */
export function newCaseTemplate(id: string) {
  const fm = {
    id,
    school: "cbt",
    title: { zh: "" },
    summary: { zh: "" },
    practiceFocus: [{ zh: "风险筛查", en: "Risk screening" }, { zh: "判断能不能承接", en: "Deciding whether you can take the client on" }],
  }
  const body = CASE_HEADINGS.map((h) => `## ${h}\n`).join("\n")
  return { frontmatter: fm as Record<string, unknown>, body }
}
