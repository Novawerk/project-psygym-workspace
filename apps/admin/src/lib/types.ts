// Shapes from docs/admin-api.md (the admin contract). Keep them in step with it.

export type Role = "admin" | "editor" | "viewer"
export type Org = "novawerk" | "lingjing"
export type Kind = "case" | "rubric"
export type Localized = { zh: string; en: string | null }

export type Me = { email: string; role: Role; org: Org }

/** A count, or "<5" when the backend hides it. Never add "<5" cells up; never draw them as 0. */
export type Count = number | "<5"

export type Granularity = "day" | "week"

export type DashboardQuery = {
  from: string
  to: string
  granularity: Granularity
  caseId?: string
  locale?: "zh" | "en"
}

export type Series = {
  metric: string
  dim: string
  points: { period: string; count: Count }[]
  total: Count
}

export type Duration = { sessions: Count; avgSec: number | null }

export type Dashboard = {
  from: string
  to: string
  granularity: Granularity
  filters: { caseId: string | null; locale: "zh" | "en" | null }
  minShown: 5
  periods: string[]
  series: Series[]
  duration: { points: { period: string; value: Duration }[]; total: Duration }
  active: { day: Series; week: Series } | null
  cases: { id: string; title: Localized }[]
}

export type Problem = { path: string; message: string }

export type ContentDoc = {
  source: string
  frontmatter: Record<string, unknown> | null
  body: string
}

export type Publisher = { email: string; role: Role }

export type VersionAction = "import" | "publish" | "rollback"

export type VersionInfo = {
  version: number
  action: VersionAction
  fromVersion: number | null
  publishedAt: string
  publishedBy: Publisher | null
  /** 「改了什么」, written on publish or rollback. */
  note: string | null
}

export type Draft = ContentDoc & {
  revision: number
  baseVersion: number | null
  updatedAt: string
  updatedBy: Publisher | null
  errors: Problem[]
  warnings: Problem[]
}

export type ContentItem = {
  kind: Kind
  id: string
  title: Localized
  publishedVersion: number | null
  publishedAt: string | null
  hasDraft: boolean
  draftUpdatedAt: string | null
  enMissing: boolean
}

export type ContentDetail = {
  kind: Kind
  id: string
  published: (ContentDoc & VersionInfo) | null
  draft: Draft | null
}

export type PublishLogEntry = VersionInfo & { kind: Kind; id: string }

export type ChatMessage = { role: "counselor" | "client"; text: string }

/** One frame of the /chat stream (docs/api-contract.md). */
export type ChatFrame =
  | { type: "turn_start" }
  | { type: "text_delta"; text: string }
  | { type: "session_end" }
  | { type: "turn_end" }
  | { type: "error"; code: string; message: string }
