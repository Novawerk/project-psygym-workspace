// Sample-data mode: an in-memory admin API that behaves like docs/admin-api.md (drafts with
// revisions, publish, rollback, conflicts, checks), so every screen can be tried without apps/api.
// The texts are placeholders, not the clinical content in content/.

import { ApiError } from "./api"
import { toSource } from "./content"
import type { AdminDataSource } from "./data-source"
import type {
  ChatFrame,
  ContentDetail,
  ContentDoc,
  ContentItem,
  Count,
  Dashboard,
  Draft,
  Kind,
  Localized,
  Me,
  Problem,
  Publisher,
  PublishLogEntry,
  Role,
  Series,
  VersionInfo,
} from "./types"

// --- Who is signed in (switchable from the sidebar in sample mode). ---

const ROLE_KEY = "psygym-admin-sample-role"

export function sampleRole(): Role {
  try {
    const r = localStorage.getItem(ROLE_KEY)
    if (r === "admin" || r === "editor" || r === "viewer") return r
  } catch {}
  return "editor"
}

export function setSampleRole(role: Role) {
  try {
    localStorage.setItem(ROLE_KEY, role)
  } catch {}
}

const me = (): Me => ({ email: `${sampleRole()}@example.com`, role: sampleRole(), org: "lingjing" })
const by = (): Publisher => ({ email: me().email, role: me().role })

// --- Content. ---

type Version = ContentDoc & VersionInfo
type Entry = { kind: Kind; id: string; versions: Version[]; draft: Draft | null }

const doc = (frontmatter: Record<string, unknown>, body: string): ContentDoc => ({
  frontmatter,
  body,
  source: toSource(frontmatter, body),
})

const caseBody = (who: string) =>
  `## 来访者基本情况\n${who}（示例正文。真实内容在 content/cases/ 里。）\n\n## 主诉\n「最近什么都不想做，早上起不来。」\n\n<!-- 临时版本，待聆镜确认 -->\n## 症状表现\n- 情绪：低落约三个月……\n\n## 认知模式和核心信念\n- 自动思维：「我又搞砸了。」\n\n## 说话风格\n话少，句子短。\n\n## 常见阻抗\n被问到父母时转移话题。\n\n## 会透露什么、不会轻易透露什么\n…\n\n## 风险等级与安全边界\n…\n`

const chenV1 = {
  id: "cbt-depression-anxiety-01",
  school: "cbt",
  title: { zh: "家事耗竭与择业迷茫", en: "Family Burnout & Career Anxiety" },
  summary: { zh: "（示例）大学生因调解家庭冲突身心疲惫，对未来迷茫。", en: "(Sample) A student worn out by family conflict." },
  clientAlias: { zh: "小陈", en: "Xiao Chen" },
  tags: [
    { zh: "抑郁", en: "Depression" },
    { zh: "焦虑", en: "Anxiety" },
  ],
  difficulty: "medium",
  estimatedMinutes: 20,
  clientIntro: { zh: "（示例）小陈，20 岁，大三学生，第一次来咨询。", en: "(Sample) Xiao Chen, 20, a third-year student." },
  practiceFocus: [
    { zh: "风险筛查", en: "Risk screening" },
    { zh: "判断能不能承接", en: "Deciding whether you can take the client on" },
    { zh: "识别自动思维", en: "Spotting automatic thoughts" },
  ],
  contentNotes: { zh: "可能涉及家庭冲突和抑郁。", en: "May touch on family conflict and depression." },
}

const linV1 = {
  id: "placeholder-cbt-depression",
  school: "cbt",
  title: { zh: "（占位）毕业后的低落", en: "(Placeholder) Low after graduation" },
  summary: { zh: "占位病例，仅用于跑通流程。", en: "Placeholder case, for testing only." },
  clientAlias: { zh: "小林", en: "Lin" },
  tags: [{ zh: "抑郁", en: "Depression" }],
  difficulty: "intro",
  estimatedMinutes: 15,
  clientIntro: { zh: "（占位）小林，23 岁，去年毕业，正在找工作。" },
  practiceFocus: [
    { zh: "风险筛查", en: "Risk screening" },
    { zh: "判断能不能承接", en: "Deciding whether you can take the client on" },
  ],
}

const rubricV1 = { id: "cbt", school: "cbt", title: { zh: "CBT 会谈督导标准", en: "CBT session supervision rubric" } }
const rubricBody = `## 这份标准适用于\n新手咨询师的 CBT 初次或早期会谈。（示例正文。真实内容在 content/rubrics/cbt.md。）\n\n## 要看的点\n\n### 1. 初访关系建立与风险评估\n- 技能 id：risk_screening\n- 看什么：……\n\n## 新手常见错误\n- ……\n\n## 好的做法\n- ……\n\n## 安全相关\n- ……\n`

const editor: Publisher = { email: "editor@example.com", role: "editor" }
const admin: Publisher = { email: "admin@example.com", role: "admin" }

const v = (version: number, action: VersionInfo["action"], at: string, who: Publisher | null, d: ContentDoc, note?: string, fromVersion: number | null = null): Version => ({
  ...d,
  version,
  action,
  fromVersion,
  publishedAt: at,
  publishedBy: who,
  note: note ?? null,
})

const store: Entry[] = [
  {
    kind: "case",
    id: "cbt-depression-anxiety-01",
    versions: [
      v(2, "publish", "2026-10-15T12:02:00Z", editor, doc(chenV1, caseBody("小陈，男，20 岁。")), "风险两句改成概括说法"),
      v(1, "import", "2026-10-15T07:00:00Z", null, doc({ ...chenV1, estimatedMinutes: 25 }, caseBody("小陈，男，20 岁。"))),
    ],
    draft: null,
  },
  {
    kind: "case",
    id: "placeholder-cbt-depression",
    versions: [v(1, "import", "2026-10-15T07:00:00Z", null, doc(linV1, caseBody("小林，23 岁。")))],
    draft: null,
  },
  {
    kind: "rubric",
    id: "cbt",
    versions: [
      v(3, "rollback", "2026-10-15T15:20:00Z", admin, doc(rubricV1, rubricBody), "v2 的第 10 点要再改", 1),
      v(2, "publish", "2026-10-15T14:05:00Z", editor, doc(rubricV1, `${rubricBody}\n### 10. 初次会谈怎么挑\n…\n`), "第 10 点加了示范"),
      v(1, "import", "2026-10-15T07:00:00Z", null, doc(rubricV1, rubricBody)),
    ],
    draft: null,
  },
]

// The case with a draft in progress, so the editor opens with something to publish.
store[0].draft = makeDraft(
  "case",
  { ...chenV1, estimatedMinutes: 25, contentNotes: { zh: "可能涉及家庭冲突、校园霸凌和抑郁。", en: "May touch on family conflict, bullying and depression." } },
  caseBody("小陈，男，20 岁，大三。"),
  1,
  2,
  editor,
)

function check(kind: Kind, fm: Record<string, unknown>, body: string): { errors: Problem[]; warnings: Problem[] } {
  const errors: Problem[] = []
  const warnings: Problem[] = []
  const loc = (k: string) => (fm[k] ?? null) as { zh?: string; en?: string } | null
  const title = loc("title")
  if (!title?.zh?.trim()) errors.push({ path: "frontmatter.title.zh", message: "必填" })
  else if ([...title.zh].length > 10) errors.push({ path: "frontmatter.title.zh", message: `中文 10 字以内（现在 ${[...title.zh].length} 字）` })
  if (title?.en && title.en.length > 40) errors.push({ path: "frontmatter.title.en", message: `英文 40 字符以内（现在 ${title.en.length}）` })
  if (!body.trim()) errors.push({ path: "body", message: "正文不能空" })
  if (kind === "rubric") return { errors, warnings }
  if (!loc("summary")?.zh?.trim()) errors.push({ path: "frontmatter.summary.zh", message: "必填" })
  const tags = (fm.tags as unknown[] | undefined) ?? []
  if (tags.length > 3) errors.push({ path: "frontmatter.tags", message: "最多 3 个" })
  const focus = ((fm.practiceFocus as { zh?: string }[] | undefined) ?? []).map((p) => p.zh)
  if (focus[0] !== "风险筛查" || focus[1] !== "判断能不能承接")
    errors.push({ path: "frontmatter.practiceFocus", message: "前两条固定为「风险筛查」「判断能不能承接」" })
  if (focus.length > 3) errors.push({ path: "frontmatter.practiceFocus", message: "最多 3 条" })
  for (const k of ["title", "summary", "clientIntro"]) {
    const l = loc(k)
    if (l?.zh && !l.en) warnings.push({ path: `frontmatter.${k}.en`, message: "英文缺失" })
  }
  return { errors, warnings }
}

function makeDraft(kind: Kind, fm: Record<string, unknown>, body: string, revision: number, baseVersion: number | null, who: Publisher | null): Draft {
  return {
    ...doc(fm, body),
    revision,
    baseVersion,
    updatedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    updatedBy: who,
    ...check(kind, fm, body),
  }
}

const find = (kind: Kind, id: string) => {
  const e = store.find((x) => x.kind === kind && x.id === id)
  if (!e) throw new ApiError(404, "not_found", "not found")
  return e
}

const info = ({ source: _s, frontmatter: _f, body: _b, ...rest }: Version): VersionInfo => rest

const detail = (e: Entry): ContentDetail => ({ kind: e.kind, id: e.id, published: e.versions[0] ?? null, draft: e.draft })

const enMissing = (fm: Record<string, unknown> | null) =>
  ["title", "summary", "clientIntro"].some((k) => {
    const l = fm?.[k] as { zh?: string; en?: string } | undefined
    return Boolean(l?.zh && !l.en)
  })

const title = (fm: Record<string, unknown> | null): Localized => {
  const t = fm?.title as { zh?: string; en?: string } | undefined
  return { zh: t?.zh ?? "", en: t?.en ?? null }
}

function requireWriter() {
  if (sampleRole() === "viewer") throw new ApiError(403, "forbidden", "forbidden")
}

const delay = <T>(value: T, ms = 120) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))

// --- Dashboard: deterministic made-up counts, hidden under 5 like the backend. ---

const DAY = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function periodsFor(from: string, to: string, granularity: "day" | "week") {
  const out: string[] = []
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (granularity === "day") {
    for (let t = start; t <= end; t += DAY) out.push(isoDay(t))
  } else {
    const dow = (new Date(start).getUTCDay() + 6) % 7
    for (let t = start - dow * DAY; t <= end; t += 7 * DAY) out.push(isoDay(t))
  }
  return out
}

const hide = (n: number): Count => (n > 0 && n < 5 ? "<5" : n)

function series(metric: string, dim: string, values: number[], periods: string[]): Series {
  const sum = values.reduce((a, b) => a + b, 0)
  return { metric, dim, points: periods.map((period, i) => ({ period, count: hide(values[i]) })), total: hide(sum) }
}

function sampleDashboard(q: Parameters<AdminDataSource["dashboard"]>[0]): Dashboard {
  const filtered = Boolean(q.caseId || q.locale)
  const k = filtered ? 0.45 : 1
  const periods = periodsFor(q.from, q.to, q.granularity)
  const w = q.granularity === "week" ? 7 : 1
  const wave = (base: number, amp: number, seed: number) =>
    periods.map((_, i) => Math.max(0, Math.round((base + amp * Math.sin((i + seed) / 3.1)) * k * w)))
  const started = wave(9, 4, 0)
  const s: Series[] = [
    series("session_started", "", started, periods),
    series("session_ended_by_client", "", wave(2, 1.5, 2), periods),
    series("report_generated", "", wave(6, 3, 1), periods),
    series("report_failed", "", wave(0.6, 0.8, 4), periods),
    series("live_supervision", "", wave(4, 2.5, 3), periods),
    series("feedback", "up", wave(1.4, 1, 1), periods),
    series("feedback", "down", wave(0.3, 0.3, 2), periods),
    series("user_report", "harmful", wave(0.05, 0.1, 1), periods),
    series("user_report", "out_of_role", wave(0.3, 0.4, 3), periods),
    series("error", "model_unavailable", wave(0.3, 0.3, 1), periods),
    series("error", "stream_error", wave(0.08, 0.1, 5), periods),
    series("error", "invalid_request", wave(0.05, 0.1, 2), periods),
  ]
  for (const [dim, base] of [["1-5", 1], ["6-15", 2.4], ["16-30", 2], ["31+", 0.5]] as const)
    s.push(series("report_generated", dim, wave(base, 0.8, base), periods))
  for (const [dim, base] of [["0-5m", 0.6], ["5-10m", 1.6], ["10-20m", 2.2], ["20-40m", 1.2], ["40m+", 0.1]] as const)
    s.push(series("session_duration", dim, wave(base, 0.6, base), periods))
  const sessions = s.filter((x) => x.metric === "session_duration").reduce((a, x) => a + x.points.reduce((b, p) => b + (p.count === "<5" ? 2 : p.count), 0), 0)
  const dau = periods.map((_, i) => Math.round((8 + 2 * Math.sin(i / 2.7)) * (q.granularity === "week" ? 2.2 : 1)))
  const sunday = (p: string) => new Date(`${p}T00:00:00Z`).getUTCDay() === 0
  const wau = periods.map((p, i) => (q.granularity === "week" || sunday(p) ? 18 + (i % 4) : 0))
  return {
    from: q.from,
    to: q.to,
    granularity: q.granularity,
    filters: { caseId: q.caseId ?? null, locale: q.locale ?? null },
    minShown: 5,
    periods,
    series: s.filter((x) => x.points.some((p) => p.count !== 0)),
    duration: {
      points: periods.map((period) => ({ period, value: { sessions: "<5", avgSec: null } })),
      total: { sessions: hide(sessions), avgSec: sessions >= 5 ? 860 : null },
    },
    active: filtered
      ? null
      : { day: series("active_day", "", dau, periods), week: series("active_week", "", wau, periods) },
    cases: store
      .filter((e) => e.kind === "case" && e.versions.length)
      .map((e) => ({ id: e.id, title: title(e.versions[0].frontmatter) })),
  }
}

// --- Preview chat: a canned client so the panel can be tried. ---

const CANNED = [
  "嗯……也不知道从哪说。最近就是什么都不想做，早上起不来。",
  "大概三个月吧。毕业以后就这样了。",
  "（沉默了一会儿）我也说不清，就是觉得自己挺没用的。",
]

async function* cannedChat(turn: number, signal?: AbortSignal): AsyncGenerator<ChatFrame> {
  yield { type: "turn_start" }
  const text = CANNED[Math.min(turn, CANNED.length - 1)]
  for (const ch of text.match(/.{1,4}/gu) ?? []) {
    if (signal?.aborted) return
    await new Promise((r) => setTimeout(r, 40))
    yield { type: "text_delta", text: ch }
  }
  if (turn >= CANNED.length - 1) yield { type: "session_end" }
  yield { type: "turn_end" }
}

export const sampleSource: AdminDataSource = {
  isSample: true,
  me: () => delay(me()),
  signInWithGoogle: () => delay(me()),
  logout: () => delay(undefined),

  dashboard: (q) => delay(sampleDashboard(q), 200),

  contentList: (kind) =>
    delay(
      store
        .filter((e) => e.kind === kind)
        .map((e): ContentItem => {
          const latest = e.versions[0] ?? null
          const fm = latest?.frontmatter ?? e.draft?.frontmatter ?? null
          return {
            kind: e.kind,
            id: e.id,
            title: title(fm),
            publishedVersion: latest?.version ?? null,
            publishedAt: latest?.publishedAt ?? null,
            hasDraft: Boolean(e.draft),
            draftUpdatedAt: e.draft?.updatedAt ?? null,
            enMissing: e.kind === "case" && enMissing(e.draft?.frontmatter ?? fm),
          }
        }),
    ),

  content: async (kind, id) => delay(detail(find(kind, id))),

  createCase: async (id, frontmatter, body) => {
    requireWriter()
    if (!/^[a-z0-9-]{3,64}$/.test(id)) throw new ApiError(400, "invalid_request", "id")
    if (store.some((e) => e.id === id)) throw new ApiError(409, "conflict", "这个 id 已经有了。")
    const e: Entry = { kind: "case", id, versions: [], draft: makeDraft("case", frontmatter, body, 1, null, by()) }
    e.draft!.updatedAt = new Date().toISOString()
    store.push(e)
    return delay(detail(e))
  },

  saveDraft: async (kind, id, input) => {
    requireWriter()
    const e = find(kind, id)
    const current = e.draft?.revision ?? null
    if (input.draftRevision !== current) throw new ApiError(409, "conflict", "draft changed")
    const base = input.rebase || !e.draft ? (e.versions[0]?.version ?? null) : e.draft.baseVersion
    e.draft = makeDraft(kind, input.frontmatter, input.body, (current ?? 0) + 1, base, by())
    e.draft.updatedAt = new Date().toISOString()
    return delay(detail(e))
  },

  discardDraft: async (kind, id, draftRevision) => {
    requireWriter()
    const e = find(kind, id)
    if (e.draft?.revision !== draftRevision) throw new ApiError(409, "conflict", "draft changed")
    e.draft = null
    return delay(undefined)
  },

  publish: async (kind, id, input) => {
    requireWriter()
    const e = find(kind, id)
    const current = e.versions[0]?.version ?? null
    if (!e.draft || e.draft.revision !== input.draftRevision || current !== input.basePublishedVersion)
      throw new ApiError(409, "conflict", "changed")
    if (e.draft.baseVersion !== current) throw new ApiError(409, "conflict", "draft outdated", [], "draft_outdated")
    if (e.draft.errors.length) throw new ApiError(422, "invalid_content", "invalid", e.draft.errors)
    const next = v((current ?? 0) + 1, "publish", new Date().toISOString(), by(), e.draft, input.note || undefined)
    e.versions.unshift(next)
    e.draft = null
    return delay(info(next), 300)
  },

  rollback: async (kind, id, input) => {
    requireWriter()
    const e = find(kind, id)
    const current = e.versions[0]?.version
    if (current !== input.basePublishedVersion) throw new ApiError(409, "conflict", "changed")
    const old = e.versions.find((x) => x.version === input.toVersion)
    if (!old || old.version === current) throw new ApiError(400, "invalid_request", "toVersion")
    const next = v(current + 1, "rollback", new Date().toISOString(), by(), old, undefined, old.version)
    e.versions.unshift(next)
    return delay(info(next), 300)
  },

  versions: async (kind, id) => delay(find(kind, id).versions.map(info)),

  version: async (kind, id, n) => {
    const found = find(kind, id).versions.find((x) => x.version === n)
    if (!found) throw new ApiError(404, "not_found", "version")
    return delay(found)
  },

  publishLog: async () => {
    const entries: PublishLogEntry[] = store
      .flatMap((e) => e.versions.map((x) => ({ ...info(x), kind: e.kind, id: e.id })))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    return delay({ entries, nextCursor: null })
  },

  async *previewChat(_id, input, signal) {
    requireWriter()
    const turn = input.messages.filter((m) => m.role === "counselor").length - 1
    yield* cannedChat(turn, signal)
  },
}

