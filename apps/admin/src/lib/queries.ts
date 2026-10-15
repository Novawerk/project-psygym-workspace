import { queryOptions } from "@tanstack/react-query"

import { dataSource } from "./data-source"
import type { StatsFilter } from "./types"

export const queryKeys = {
  me: ["me"] as const,
  stats: (f: StatsFilter) => ["stats", f] as const,
  cases: ["cases"] as const,
  case: (id: string) => ["cases", id] as const,
  rubrics: ["rubrics"] as const,
  rubric: (id: string) => ["rubrics", id] as const,
  releases: ["releases"] as const,
}

export const meQueryOptions = queryOptions({ queryKey: queryKeys.me, queryFn: () => dataSource.me(), retry: false })

export const statsQueryOptions = (f: StatsFilter) =>
  queryOptions({ queryKey: queryKeys.stats(f), queryFn: () => dataSource.stats(f) })

export const casesQueryOptions = queryOptions({ queryKey: queryKeys.cases, queryFn: () => dataSource.cases() })

export const caseQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.case(id), queryFn: () => dataSource.case(id) })

export const rubricsQueryOptions = queryOptions({ queryKey: queryKeys.rubrics, queryFn: () => dataSource.rubrics() })

export const rubricQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.rubric(id), queryFn: () => dataSource.rubric(id) })

export const releasesQueryOptions = queryOptions({ queryKey: queryKeys.releases, queryFn: () => dataSource.releases() })
