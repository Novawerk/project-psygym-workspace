import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { FlaskConicalIcon, Loader2Icon } from "lucide-react"

import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { dataSource } from "@/lib/data-source"
import { GOOGLE_CLIENT_ID } from "@/lib/env"
import { queryKeys } from "@/lib/queries"

export const Route = createFileRoute("/login")({
  component: LoginPage,
})

/** Google only (D-A3). The API checks the ID token against the admins table and sets the cookie. */
function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleCredential = async (credential: string) => {
    setBusy(true)
    setError(null)
    try {
      await dataSource.signInWithGoogle(credential)
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
      await navigate({ to: "/" })
    } catch {
      setError("登录没成功。只有加进后台名单的邮箱能登录，有问题找管理员。")
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-2 size-12 rounded-xl" />
          <CardTitle className="text-xl">聆镜 PSYGYM 后台</CardTitle>
          <CardDescription>给 Novawerk 和聆镜团队用。用 Google 账号登录。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {GOOGLE_CLIENT_ID ? (
            <GoogleSignInButton
              clientId={GOOGLE_CLIENT_ID}
              onCredential={(c) => void handleCredential(c)}
              onError={setError}
            />
          ) : (
            <>
              <Button variant="outline" size="lg" disabled className="w-full max-w-72">
                用 Google 登录
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                需要设置 <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code>。
              </p>
            </>
          )}
          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> 正在登录…
            </p>
          )}
          {error && (
            <p role="alert" className="text-center text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
        {dataSource.isSample && (
          <CardFooter className="flex-col gap-2 border-t text-center">
            <p className="text-xs text-muted-foreground">示例数据模式，不用登录。</p>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/" />}>
              <FlaskConicalIcon /> 看示例数据
            </Button>
          </CardFooter>
        )}
      </Card>
    </main>
  )
}
