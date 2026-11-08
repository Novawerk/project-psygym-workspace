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

/** Someone with access to the admin (GET /admin/people; role admin only). */
export type Person = {
  id: string
  email: string
  role: Role
  org: Org
  enabled: boolean
  /** Has signed in at least once (their Google account is bound). */
  signedInOnce: boolean
  createdAt: string
  lastLoginAt: string | null
}

export type NewPerson = { email: string; role: Role; org: Org }
export type PersonPatch = Partial<{ role: Role; org: Org; enabled: boolean }>

/** Model settings (GET /admin/model-settings; role admin only; docs/decisions/0015-model-settings.md). */
export type ModelProviderId = "anthropic" | "deepseek"
export type LlmRole = "client" | "supervisor"
export type ModelSettings =
  | { enabled: false }
  | {
      enabled: true
      roles: Record<LlmRole, { provider: string | null; model: string | null; from: "admin" | "env"; available: boolean; reason?: string }>
      keys: Record<ModelProviderId, { from: "admin" | "env" | null; hint: string | null }>
      providers: { id: ModelProviderId; allowed: boolean; defaultModel: string }[]
      updatedAt: string | null
      log: { at: string; by: string | null; change: string }[]
    }
/** null for a role: back to the server's default. A key: null or "" removes the one stored in the admin. */
export type ModelSettingsPatch = Partial<Record<LlmRole, { provider: ModelProviderId; model: string } | null>> & {
  keys?: Partial<Record<ModelProviderId, string | null>>
}
