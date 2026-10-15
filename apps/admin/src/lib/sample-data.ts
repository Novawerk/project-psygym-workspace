// Fictional data for sample-data mode. Ids match content/ so links read naturally; the text is
// placeholder, not the clinical content (that lives in content/ and, later, the database).

import type { CaseDetail, Me, Release, RubricDetail, Role, Stats, StatsFilter, StatsPoint } from "./types"

export function sampleMe(role: Role): Me {
  return { email: "sample@novawerk.io", name: "示例成员", role, org: "novawerk" }
}

export const SAMPLE_CASES: CaseDetail[] = [
  {
    id: "cbt-depression-anxiety-01",
    title: { zh: "家事耗竭与择业迷茫", en: "Family Burnout & Career Anxiety" },
    school: "cbt",
    publishedVersion: 2,
    hasDraft: true,
    missingEnglish: false,
    updatedAt: "2026-10-15T09:12:00Z",
    fields: {
      id: "cbt-depression-anxiety-01",
      school: "cbt",
      title: { zh: "家事耗竭与择业迷茫", en: "Family Burnout & Career Anxiety" },
      summary: { zh: "（示例）一两句话的病例简介。", en: "(Sample) A one-line case summary." },
      clientAlias: { zh: "小陈", en: "Xiao Chen" },
      tags: [
        { zh: "抑郁", en: "Depression" },
        { zh: "焦虑", en: "Anxiety" },
      ],
      difficulty: "medium",
      estimatedMinutes: 20,
      clientIntro: { zh: "（示例）来访者卡片的两三句介绍。", en: "(Sample) Two or three lines about the client." },
      practiceFocus: [
        { zh: "风险筛查", en: "Risk screening" },
        { zh: "识别自动思维", en: "Spotting automatic thoughts" },
      ],
      contentNotes: { zh: "（示例）内容提示。", en: "(Sample) Content note." },
      body: "## 来访者基本情况\n（示例正文。真实内容在 content/cases/ 里。）\n\n## 主诉\n…\n",
    },
    versions: [
      { version: 2, action: "publish", by: "聆镜 · 编辑", at: "2026-10-14T16:40:00Z" },
      { version: 1, action: "publish", by: "Novawerk · 管理员", at: "2026-10-12T10:05:00Z" },
    ],
  },
  {
    id: "placeholder-cbt-depression",
    title: { zh: "毕业后的低落", en: "" },
    school: "cbt",
    publishedVersion: 1,
    hasDraft: false,
    missingEnglish: true,
    updatedAt: "2026-10-10T08:00:00Z",
    fields: {
      id: "placeholder-cbt-depression",
      school: "cbt",
      title: { zh: "毕业后的低落", en: "" },
      summary: { zh: "（示例）占位病例。", en: "" },
      clientAlias: { zh: "小林", en: "" },
      tags: [{ zh: "抑郁", en: "" }],
      difficulty: "intro",
      estimatedMinutes: 15,
      clientIntro: { zh: "（示例）", en: "" },
      practiceFocus: [{ zh: "建立关系", en: "" }],
      contentNotes: { zh: "", en: "" },
      body: "## 来访者基本情况\n（示例正文。）\n",
    },
    versions: [{ version: 1, action: "publish", by: "Novawerk · 管理员", at: "2026-10-10T08:00:00Z" }],
  },
]

export const SAMPLE_RUBRICS: RubricDetail[] = [
  {
    id: "cbt",
    title: { zh: "CBT 会谈督导标准", en: "CBT session supervision rubric" },
    school: "cbt",
    publishedVersion: 1,
    hasDraft: false,
    updatedAt: "2026-10-14T12:00:00Z",
    body: "## 这份标准适用于\n（示例正文。真实内容在 content/rubrics/cbt.md。）\n\n## 要看的点\n\n### 1. …\n",
    versions: [{ version: 1, action: "publish", by: "Novawerk · 管理员", at: "2026-10-14T12:00:00Z" }],
  },
]

export const SAMPLE_RELEASES: Release[] = [
  { id: "r3", kind: "case", contentId: "cbt-depression-anxiety-01", version: 2, action: "publish", by: "聆镜 · 编辑", at: "2026-10-14T16:40:00Z", synced: true },
  { id: "r2", kind: "rubric", contentId: "cbt", version: 1, action: "publish", by: "Novawerk · 管理员", at: "2026-10-14T12:00:00Z", synced: true },
  { id: "r1", kind: "case", contentId: "cbt-depression-anxiety-01", version: 1, action: "publish", by: "Novawerk · 管理员", at: "2026-10-12T10:05:00Z", synced: false },
]

/** Deterministic made-up numbers so screenshots don't change between reloads. */
export function sampleStats(filter: StatsFilter): Stats {
  const filtered = Boolean(filter.caseId || filter.locale)
  const days: StatsPoint[] = []
  const from = new Date(`${filter.from}T00:00:00Z`)
  const to = new Date(`${filter.to}T00:00:00Z`)
  let i = 0
  for (let d = from; d <= to; d = new Date(d.getTime() + 86_400_000), i++) {
    const started = 3 + ((i * 7) % 11)
    const completed = Math.max(0, started - 2 - (i % 3))
    days.push({
      day: d.toISOString().slice(0, 10),
      started: started < 5 ? "<5" : started,
      completed: completed < 5 ? "<5" : completed,
    })
  }
  return {
    summary: {
      started: 214,
      completed: 151,
      completionRate: 151 / 214,
      liveSupervision: 88,
      thumbsUpRate: 0.82,
      dailyActive: filtered ? null : 12,
      weeklyActive: filtered ? null : 37,
    },
    series: days,
  }
}
