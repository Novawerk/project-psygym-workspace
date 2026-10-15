import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { FlaskConicalIcon, Loader2Icon } from "lucide-react"

import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { dataSource } from "@/lib/data-source"
import { GOOGLE_CLIENT_ID } from "@/lib/env"
import { COPY } from "@/lib/labels"
import { queryKeys } from "@/lib/queries"

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { expired?: boolean } =>
    search.expired ? { expired: true } : {},
  component: LoginPage,
})

function signInMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "not_admin") return "这个 Google 账号没有后台权限。需要的话，请联系负责人。"
  if (error instanceof ApiError && error.status === 429) return "登录尝试太多了，请稍后再试。"
  return "登录没有成功，请再试一次。"
}

/** Google only (D-A3). The API checks the ID token against the admins table and sets the cookie. */
function LoginPage() {
  const { expired } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(expired ? COPY.expired : null)
  // After a 429 the button stays off until Retry-After has passed.
  const [lockedUntil, setLockedUntil] = React.useState(0)
  const [, tick] = React.useReducer((n: number) => n + 1, 0)
  const locked = lockedUntil > Date.now()
  React.useEffect(() => {
    if (!locked) return
    const t = setTimeout(tick, lockedUntil - Date.now() + 50)
    return () => clearTimeout(t)
  }, [locked, lockedUntil])

  const handleCredential = async (idToken: string) => {
    setBusy(true)
    setError(null)
    try {
      const me = await dataSource.signInWithGoogle(idToken)
      queryClient.setQueryData(queryKeys.me, me)
      await navigate({ to: "/" })
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setLockedUntil(Date.now() + (err.retryAfter ?? 600) * 1000)
      setError(signInMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-6">
      <div className="flex w-full max-w-[380px] flex-col gap-5 rounded-xl border bg-background p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="size-10" />
          <h1 className="text-xl font-bold">聆镜 PSYGYM 后台</h1>
          <p className="text-sm text-muted-foreground">只给 Novawerk 和聆镜团队使用。</p>
        </div>
        {error && (
          <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}
        {GOOGLE_CLIENT_ID && !dataSource.isSample && !locked ? (
          <GoogleSignInButton clientId={GOOGLE_CLIENT_ID} onCredential={(c) => void handleCredential(c)} onError={setError} />
        ) : (
          <Button variant="outline" size="lg" disabled={!dataSource.isSample || locked} onClick={() => void handleCredential("sample")}>
            用 Google 登录
          </Button>
        )}
        {busy && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> 正在登录…
          </p>
        )}
        <p className="text-center text-xs text-muted-foreground">admin.psygym.novawerk.io</p>
        {dataSource.isSample && (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/" />}>
            <FlaskConicalIcon /> 示例数据模式，不用登录
          </Button>
        )}
      </div>
    </main>
  )
}
