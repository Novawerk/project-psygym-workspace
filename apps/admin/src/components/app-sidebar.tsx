import { Link, useLocation } from "@tanstack/react-router"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { NAV, isActive } from "@/lib/nav"

export function AppSidebar() {
  const pathname = useLocation({ select: (location) => location.pathname })
  // On a phone the sidebar is a sheet over the page: close it once a link is picked.
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <img src="/favicon.svg" alt="" className="size-8 rounded-md" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">聆镜 PSYGYM</span>
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
      <SidebarRail />
    </Sidebar>
  )
}
