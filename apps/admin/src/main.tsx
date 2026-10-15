import "./styles.css"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { ThemeProvider } from "next-themes"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { isUnauthorized } from "@/lib/api"
import { queryKeys } from "@/lib/queries"

import { routeTree } from "./routeTree.gen"

/**
 * A 401 mid-session (expired, or the admin was disabled) goes back to the sign-in page with
 * 「登录已过期」. Only when someone was signed in on this page: a first visit's 401 from
 * GET /admin/me is just the way in, and _app's beforeLoad sends it to a plain /login.
 */
const onError = (error: unknown) => {
  const signedIn = queryClient.getQueryData(queryKeys.me) !== undefined
  if (isUnauthorized(error) && signedIn && router.state.location.pathname !== "/login") {
    queryClient.clear()
    void router.navigate({ to: "/login", search: { expired: true } })
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (n, e) => !isUnauthorized(e) && n < 2 } },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  // Let TanStack Query decide freshness; the router shouldn't cache loader data on its own.
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")
if (!root) throw new Error("#root is missing from index.html")

createRoot(root).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      storageKey="psygym-admin-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
        <Toaster position="bottom-right" />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
