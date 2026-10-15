import { useQueryClient } from "@tanstack/react-query"
import { Link, useLocation, useNavigate } from "@tanstack/react-router"

import { Logo } from "@/components/logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { dataSource } from "@/lib/data-source"
import { ORG_LABEL, ROLE_LABEL } from "@/lib/labels"
import { NAV, isActive } from "@/lib/nav"
import { queryKeys } from "@/lib/queries"
import { setSampleRole } from "@/lib/sample-store"
import type { Me, Role } from "@/lib/types"

export function AppSidebar({ me }: { me: Me }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // On a phone the sidebar is a sheet over the page: close it once a link is picked.
  const { isMobile, setOpenMobile } = useSidebar()

  const logout = async () => {
    await dataSource.logout()
    queryClient.clear()
    await navigate({ to: "/login" })
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <Logo className="size-7!" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-bold">聆镜 PSYGYM</span>
                <span className="truncate text-xs text-muted-foreground">后台</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive(item, pathname)}
                  render={<Link to={item.to} onClick={() => isMobile && setOpenMobile(false)} />}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <div className="flex flex-col gap-0.5 border-t px-2 pt-3">
          <span className="truncate text-sm font-semibold">{me.email}</span>
          <span className="text-xs text-muted-foreground">
            {ROLE_LABEL[me.role]} · {ORG_LABEL[me.org]}
          </span>
          {dataSource.isSample && (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              示例角色
              <select
                className="rounded border bg-background px-1 py-0.5 text-foreground"
                value={me.role}
                onChange={(e) => {
                  setSampleRole(e.target.value as Role)
                  void queryClient.invalidateQueries({ queryKey: queryKeys.me })
                }}
              >
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 self-start text-sm text-muted-foreground hover:text-foreground"
          >
            退出
          </button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
