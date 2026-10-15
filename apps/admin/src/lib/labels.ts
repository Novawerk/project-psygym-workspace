import type { MaskedCount, Role, VersionAction } from "./types"

export const ROLE_LABEL: Record<Role, string> = { admin: "管理员", editor: "编辑", viewer: "只读" }

/** Viewers see no edit, publish or rollback controls at all (hidden, not disabled). */
export const canEdit = (role: Role) => role !== "viewer"

export const ACTION_LABEL: Record<VersionAction, string> = { publish: "发布", rollback: "回滚" }

export const DIFFICULTY_LABEL = { intro: "入门", medium: "中等", hard: "较难" } as const

/** "<5" stays "<5"; it is never drawn as 0. */
export const formatCount = (n: MaskedCount | null) => (n === null ? "—" : n === "<5" ? "<5" : n.toLocaleString("zh-CN"))

export const formatPercent = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`)

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })
}
