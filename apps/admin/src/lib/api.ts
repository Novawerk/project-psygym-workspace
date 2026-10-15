import { API_BASE } from "./env"
import type { Problem } from "./types"

/** An error answer from the admin API: `{ error: { code, message }, errors?, warnings? }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly errors: Problem[] = [],
    /** 409 only: "draft_outdated" when the draft started from an older published version. */
    readonly reason?: string,
  ) {
    super(message)
  }
}

export const isUnauthorized = (e: unknown) => e instanceof ApiError && e.status === 401
export const isConflict = (e: unknown) => e instanceof ApiError && e.status === 409
export const isDraftOutdated = (e: unknown) => isConflict(e) && (e as ApiError).reason === "draft_outdated"

export async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: "include",
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!res.ok) throw await toError(res)
  return (res.status === 204 ? undefined : await res.json()) as T
}

export async function toError(res: Response) {
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string; reason?: string }
    errors?: Problem[]
    reason?: string
  } | null
  return new ApiError(
    res.status,
    body?.error?.code ?? "unknown",
    body?.error?.message ?? res.statusText,
    body?.errors,
    body?.error?.reason ?? body?.reason,
  )
}
