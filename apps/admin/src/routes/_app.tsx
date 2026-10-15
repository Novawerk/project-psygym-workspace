import { Outlet, createFileRoute, redirect, useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { CloudOffIcon, TriangleAlertIcon } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { SampleDataBadge } from "@/components/sample-data-badge"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { isUnauthorized } from "@/lib/data-source"
import { API_URL } from "@/lib/env"
import { meQueryOptions } from "@/lib/queries"

/**
 * Pathless layout for every signed-in page. `beforeLoad` asks who is signed in; a 401 sends the
 * visitor to /login. The API re-checks the admins table on every request, so a removed admin is
 * out at once.
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQueryOptions)
    } catch (error) {
      if (isUnauthorized(error)) throw redirect({ to: "/login" })
      throw error
    }
  },
  component: AppLayout,
  errorComponent: LayoutError,
})

function AppLayout() {
  // Read through the query (not route context) so the sample-mode role switch re-renders.
  const { data: me } = useQuery(meQueryOptions)
  if (!me) return null

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <SampleDataBadge />
            <UserMenu me={me} />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/** fetch() rejects with a TypeError when the server can't be reached (down, CORS, offline). */
const isNetworkError = (error: unknown) => error instanceof TypeError && /fetch|network|load/i.test(error.message)

function LayoutError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const offline = isNetworkError(error)
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{offline ? <CloudOffIcon /> : <TriangleAlertIcon />}</EmptyMedia>
          <EmptyTitle>{offline ? "连不上接口" : "出错了"}</EmptyTitle>
          <EmptyDescription>
            {offline ? (
              <>
                后台调的是 <code className="font-mono text-xs">{API_URL}</code>。本地开发可以设{" "}
                <code className="font-mono text-xs">VITE_USE_SAMPLE_DATA=true</code> 看示例数据。
              </>
            ) : (
              <code className="font-mono text-xs">{error instanceof Error ? error.message : String(error)}</code>
            )}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            onClick={() => {
              reset()
              void router.invalidate()
            }}
          >
            重试
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
