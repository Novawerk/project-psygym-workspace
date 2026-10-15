// One interface, two implementations: the admin API (docs/admin-api.md) and an in-memory sample
// store. Screens never call fetch directly; they go through the hooks in ./queries.ts.

import { call, toError } from "./api"
import { API_BASE, USE_SAMPLE_DATA } from "./env"
import { sampleSource } from "./sample-store"
import { readFrames } from "./sse"
import type {
  ChatFrame,
  ChatMessage,
  ContentDetail,
  ContentDoc,
  ContentItem,
  Dashboard,
  DashboardQuery,
  Kind,
  Me,
  PublishLogEntry,
  VersionInfo,
} from "./types"

export type DraftInput = {
  draftRevision: number | null
  /** After a draft_outdated publish: move the draft onto the current published version. */
  rebase?: true
  frontmatter: Record<string, unknown>
  body: string
}
/** `note` is 「改了什么」: optional, at most 200 characters, only in the publish log (not Slack). */
export type PublishInput = { draftRevision: number; basePublishedVersion: number | null; note?: string }
export type RollbackInput = { toVersion: number; basePublishedVersion: number; note?: string }
export type PreviewChatInput = { locale: "zh" | "en"; messages: ChatMessage[]; source?: string }

export interface AdminDataSource {
  readonly isSample: boolean
  me(): Promise<Me>
  signInWithGoogle(idToken: string): Promise<Me>
  logout(): Promise<void>

  dashboard(q: DashboardQuery): Promise<Dashboard>

  contentList(kind: Kind): Promise<ContentItem[]>
  content(kind: Kind, id: string): Promise<ContentDetail>
  createCase(id: string, frontmatter: Record<string, unknown>, body: string): Promise<ContentDetail>
  saveDraft(kind: Kind, id: string, input: DraftInput): Promise<ContentDetail>
  discardDraft(kind: Kind, id: string, draftRevision: number): Promise<void>
  publish(kind: Kind, id: string, input: PublishInput): Promise<VersionInfo>
  rollback(kind: Kind, id: string, input: RollbackInput): Promise<VersionInfo>
  versions(kind: Kind, id: string): Promise<VersionInfo[]>
  version(kind: Kind, id: string, version: number): Promise<ContentDoc & VersionInfo>
  publishLog(cursor?: string | null): Promise<{ entries: PublishLogEntry[]; nextCursor: string | null }>

  /** The /chat stream, with the draft (or `source`) as the role brief. Not counted, not stored. */
  previewChat(id: string, input: PreviewChatInput, signal?: AbortSignal): AsyncGenerator<ChatFrame>
}

const path = (kind: Kind, id: string) => `/admin/content/${kind}/${encodeURIComponent(id)}`

const apiSource: AdminDataSource = {
  isSample: false,
  me: () => call("/admin/me"),
  signInWithGoogle: (idToken) => call("/admin/auth/google", { method: "POST", json: { idToken } }),
  logout: () => call("/admin/auth/logout", { method: "POST", json: {} }),

  dashboard: (q) => {
    const params = new URLSearchParams({ from: q.from, to: q.to, granularity: q.granularity })
    if (q.caseId) params.set("caseId", q.caseId)
    if (q.locale) params.set("locale", q.locale)
    return call(`/admin/dashboard?${params}`)
  },

  contentList: async (kind) => (await call<{ items: ContentItem[] }>(`/admin/content?kind=${kind}`)).items,
  content: (kind, id) => call(path(kind, id)),
  createCase: (id, frontmatter, body) =>
    call("/admin/content", { method: "POST", json: { kind: "case", id, frontmatter, body } }),
  saveDraft: (kind, id, input) => call(`${path(kind, id)}/draft`, { method: "PUT", json: input }),
  discardDraft: (kind, id, draftRevision) =>
    call(`${path(kind, id)}/draft`, { method: "DELETE", json: { draftRevision } }),
  publish: (kind, id, input) => call(`${path(kind, id)}/publish`, { method: "POST", json: input }),
  rollback: (kind, id, input) => call(`${path(kind, id)}/rollback`, { method: "POST", json: input }),
  versions: async (kind, id) => (await call<{ versions: VersionInfo[] }>(`${path(kind, id)}/versions`)).versions,
  version: (kind, id, v) => call(`${path(kind, id)}/versions/${v}`),
  publishLog: (cursor) => call(`/admin/publish-log?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),

  async *previewChat(id, input, signal) {
    const res = await fetch(`${API_BASE}${path("case", id)}/preview-chat`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    })
    if (!res.ok || !res.body) throw await toError(res)
    yield* readFrames(res.body)
  },
}

export const dataSource: AdminDataSource = USE_SAMPLE_DATA ? sampleSource : apiSource
