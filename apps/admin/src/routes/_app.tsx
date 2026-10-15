import { Outlet, createFileRoute, redirect, useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { TriangleAlertIcon } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { Crumbs, CrumbsProvider } from "@/components/crumbs"
import { SampleDataBadge } from "@/components/sample-data-badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { isUnauthorized } from "@/lib/api"
import { COPY } from "@/lib/labels"
import { meQueryOptions } from "@/lib/queries"

/**
 * Pathless layout for every signed-in page. `beforeLoad` asks GET /admin/me; a 401 sends the
 * visitor to /login. The API re-checks the admins table on every request, and main.tsx sends any
 * later 401 back to /login too, so a disabled admin is out at once.
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
      <CrumbsProvider>
        <AppSidebar me={me} />
        <SidebarInset className="h-svh min-w-0 overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
            <Crumbs />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <SampleDataBadge />
              <ThemeToggle />
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        </SidebarInset>
      </CrumbsProvider>
    </SidebarProvider>
  )
}

function LayoutError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{COPY.error}</EmptyTitle>
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
