import { queryOptions } from "@tanstack/react-query"

import { dataSource } from "./data-source"
import type { DashboardQuery, Kind } from "./types"

export const queryKeys = {
  me: ["me"] as const,
  dashboard: (q: DashboardQuery) => ["dashboard", q] as const,
  content: ["content"] as const,
  list: (kind: Kind) => ["content", "list", kind] as const,
  item: (kind: Kind, id: string) => ["content", "item", kind, id] as const,
  versions: (kind: Kind, id: string) => ["content", "versions", kind, id] as const,
  version: (kind: Kind, id: string, v: number) => ["content", "version", kind, id, v] as const,
  publishLog: ["content", "publish-log"] as const,
}

export const meQueryOptions = queryOptions({ queryKey: queryKeys.me, queryFn: () => dataSource.me(), retry: false })

export const dashboardQueryOptions = (q: DashboardQuery) =>
  queryOptions({ queryKey: queryKeys.dashboard(q), queryFn: () => dataSource.dashboard(q), placeholderData: (prev) => prev })

export const listQueryOptions = (kind: Kind) =>
  queryOptions({ queryKey: queryKeys.list(kind), queryFn: () => dataSource.contentList(kind) })

export const itemQueryOptions = (kind: Kind, id: string) =>
  queryOptions({ queryKey: queryKeys.item(kind, id), queryFn: () => dataSource.content(kind, id) })

export const versionsQueryOptions = (kind: Kind, id: string) =>
  queryOptions({ queryKey: queryKeys.versions(kind, id), queryFn: () => dataSource.versions(kind, id) })

export const versionQueryOptions = (kind: Kind, id: string, v: number) =>
  queryOptions({
    queryKey: queryKeys.version(kind, id, v),
    queryFn: () => dataSource.version(kind, id, v),
    staleTime: Number.POSITIVE_INFINITY, // a published version never changes
  })

export const publishLogQueryOptions = queryOptions({
  queryKey: queryKeys.publishLog,
  queryFn: () => dataSource.publishLog(),
})
