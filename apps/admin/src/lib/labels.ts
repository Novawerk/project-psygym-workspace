// Copy from docs/product/admin-phase1.md §9. Keep wording in step with it.

import type { Count, Kind, Org, Role, VersionInfo } from "./types"

export const ROLE_LABEL: Record<Role, string> = { admin: "管理员", editor: "编辑", viewer: "只读" }
export const ORG_LABEL: Record<Org, string> = { novawerk: "Novawerk", lingjing: "聆镜" }
export const KIND_LABEL: Record<Kind, string> = { case: "病例", rubric: "督导标准" }

/** Viewers see no new, save, publish or restore controls at all: hidden, not disabled. */
export const canWrite = (role: Role) => role !== "viewer"

export const DIFFICULTY_LABEL = { intro: "入门", medium: "中等", hard: "较难" } as const

export function actionLabel(v: Pick<VersionInfo, "action" | "fromVersion">) {
  if (v.action === "import") return "导入"
  if (v.action === "rollback") return `回滚到 v${v.fromVersion}`
  return "发布"
}

export const HIDDEN_HINT = "少于 5，不显示具体数字"

/** "<5" stays "<5": never 0, never added up. */
export const formatCount = (n: Count | null | undefined) =>
  n === null || n === undefined ? "—" : n === "<5" ? "<5" : n.toLocaleString("zh-CN")

export const formatPercent = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`)

/** Admin times are shown in the viewer's local time, e.g. 2026-10-15 14:02. */
export function formatTime(iso: string | null | undefined) {
  if (!iso) return "—"
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function formatDuration(sec: number | null) {
  if (sec === null) return "—"
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return s ? `${m} 分 ${s} 秒` : `${m} 分钟`
}

export const ERROR_CODE_HINT: Record<string, string> = {
  invite_required: "缺邀请码或没登录",
  rate_limited: "超出限流",
  model_unavailable: "模型服务不可用",
  case_not_found: "病例不存在",
  invalid_request: "请求格式不对",
  stream_error: "回复中途出错",
  internal: "服务器内部错误",
}

/** Report reasons as the App shows them (docs/product/copy.md). */
export const REPORT_REASON_HINT: Record<string, string> = {
  harmful: "冒犯或伤害性的内容",
  out_of_role: "跳出了来访者的角色",
  unsafe_advice: "给了危险或不当的建议",
  other: "其他",
}

export const TURN_BUCKETS = [
  ["1-5", "1–5 轮"],
  ["6-15", "6–15 轮"],
  ["16-30", "16–30 轮"],
  ["31+", "31 轮以上"],
] as const

export const DURATION_BUCKETS = [
  ["0-5m", "0–5 分钟"],
  ["5-10m", "5–10 分钟"],
  ["10-20m", "10–20 分钟"],
  ["20-40m", "20–40 分钟"],
  ["40m+", "40 分钟以上"],
] as const

export const COPY = {
  loading: "正在加载…",
  error: "出错了，请刷新再试。",
  expired: "登录已过期，请重新登录。",
  disabled: "你的后台权限已停用。需要的话，请联系负责人。",
  readOnly: "你是只读角色，不能修改。",
}
