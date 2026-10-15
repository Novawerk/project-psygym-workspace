// One interface, two implementations: the PSYGYM API and an in-memory sample store. Screens never
// call fetch directly; they go through the hooks in ./queries.ts.
//
// The API side is a stub until the admin contract lands: paths below are guesses to replace.

import { API_URL, USE_SAMPLE_DATA } from "./env"
import { SAMPLE_CASES, SAMPLE_RELEASES, SAMPLE_RUBRICS, sampleMe, sampleStats } from "./sample-data"
import type {
  CaseDetail,
  CaseSummary,
  Me,
  Release,
  RubricDetail,
  RubricSummary,
  Role,
  Stats,
  StatsFilter,
} from "./types"

export interface AdminDataSource {
  readonly isSample: boolean
  me(): Promise<Me>
  signInWithGoogle(credential: string): Promise<void>
  signOut(): Promise<void>

  stats(filter: StatsFilter): Promise<Stats>

  cases(): Promise<CaseSummary[]>
  case(id: string): Promise<CaseDetail>

  rubrics(): Promise<RubricSummary[]>
  rubric(id: string): Promise<RubricDetail>

  releases(): Promise<Release[]>
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, body?.error ?? `${res.status} ${res.statusText}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const apiSource: AdminDataSource = {
  isSample: false,
  me: () => call("/admin/me"),
  signInWithGoogle: (credential) => call("/admin/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),
  signOut: () => call("/admin/auth/sign-out", { method: "POST" }),
  stats: (f) => call(`/admin/stats?${new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])}`),
  cases: () => call("/admin/cases"),
  case: (id) => call(`/admin/cases/${encodeURIComponent(id)}`),
  rubrics: () => call("/admin/rubrics"),
  rubric: (id) => call(`/admin/rubrics/${encodeURIComponent(id)}`),
  releases: () => call("/admin/releases"),
}

const ROLE_KEY = "psygym-admin-sample-role"

/** Sample mode lets you switch roles from the user menu to see what each one sees. */
export function sampleRole(): Role {
  try {
    const r = localStorage.getItem(ROLE_KEY)
    if (r === "admin" || r === "editor" || r === "viewer") return r
  } catch {}
  return "admin"
}

export function setSampleRole(role: Role) {
  try {
    localStorage.setItem(ROLE_KEY, role)
  } catch {}
}

const notFound = (what: string) => new ApiError(404, `${what} not found`)
const delay = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), 150))

const sampleSource: AdminDataSource = {
  isSample: true,
  me: () => delay(sampleMe(sampleRole())),
  signInWithGoogle: () => delay(undefined),
  signOut: () => delay(undefined),
  stats: (f) => delay(sampleStats(f)),
  cases: () => delay(SAMPLE_CASES.map(({ fields: _f, versions: _v, ...summary }) => summary)),
  case: (id) => {
    const found = SAMPLE_CASES.find((c) => c.id === id)
    return found ? delay(found) : Promise.reject(notFound("Case"))
  },
  rubrics: () => delay(SAMPLE_RUBRICS.map(({ body: _b, versions: _v, ...summary }) => summary)),
  rubric: (id) => {
    const found = SAMPLE_RUBRICS.find((r) => r.id === id)
    return found ? delay(found) : Promise.reject(notFound("Rubric"))
  },
  releases: () => delay(SAMPLE_RELEASES),
}

export const dataSource: AdminDataSource = USE_SAMPLE_DATA ? sampleSource : apiSource
