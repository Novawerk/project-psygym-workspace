// Placeholder shapes until the admin API contract lands (backend owns it). Keep screens on
// these names so swapping in the contract's types is a local change.

export type Role = "admin" | "editor" | "viewer"

export type Me = {
  email: string
  name: string
  role: Role
  /** Novawerk or 聆镜. */
  org: "novawerk" | "psygym"
}

export type Bilingual = { zh: string; en: string }

export type CaseSummary = {
  id: string
  title: Bilingual
  school: string
  /** Latest published version; null when never published. */
  publishedVersion: number | null
  hasDraft: boolean
  missingEnglish: boolean
  updatedAt: string
}

export type CaseFields = {
  id: string
  school: string
  title: Bilingual
  summary: Bilingual
  clientAlias: Bilingual
  tags: Bilingual[]
  difficulty: "intro" | "medium" | "hard"
  estimatedMinutes: number
  clientIntro: Bilingual
  practiceFocus: Bilingual[]
  contentNotes: Bilingual
  /** The role brief the AI client reads (markdown). */
  body: string
}

export type VersionAction = "publish" | "rollback"

export type ContentVersion = {
  version: number
  action: VersionAction
  /** For a rollback: the version it restored. */
  restoredFrom?: number
  by: string
  at: string
}

export type CaseDetail = CaseSummary & {
  fields: CaseFields
  versions: ContentVersion[]
}

export type RubricSummary = {
  id: string
  title: Bilingual
  school: string
  publishedVersion: number | null
  hasDraft: boolean
  updatedAt: string
}

export type RubricDetail = RubricSummary & {
  body: string
  versions: ContentVersion[]
}

export type Release = {
  id: string
  kind: "case" | "rubric"
  contentId: string
  version: number
  action: VersionAction
  by: string
  at: string
  /** Whether the export to content/ on GitHub went through. */
  synced: boolean
}

/** A count, or "<5" when the backend masks it. Never draw "<5" as 0. */
export type MaskedCount = number | "<5"

export type StatsFilter = {
  from: string
  to: string
  interval: "day" | "week"
  caseId?: string
  locale?: "zh" | "en"
}

export type StatsSummary = {
  started: MaskedCount
  completed: MaskedCount
  /** completed ÷ started, 0–1; null when either is masked. */
  completionRate: number | null
  liveSupervision: MaskedCount
  /** 👍 ÷ (👍 + 👎), 0–1; null when masked. */
  thumbsUpRate: number | null
  /** null with a filter on: the pseudonym counts don't split by case or locale. */
  dailyActive: MaskedCount | null
  weeklyActive: MaskedCount | null
}

export type StatsPoint = { day: string; started: MaskedCount; completed: MaskedCount }

export type Stats = { summary: StatsSummary; series: StatsPoint[] }
