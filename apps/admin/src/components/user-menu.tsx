import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { dataSource, setSampleRole } from "@/lib/data-source"
import { ROLE_LABEL } from "@/lib/labels"
import { queryKeys } from "@/lib/queries"
import type { Me, Role } from "@/lib/types"

/** Top-right: email, role, theme and sign-out. In sample mode, also a role switcher. */
export function UserMenu({ me }: { me: Me }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { theme, setTheme } = useTheme()

  const signOut = async () => {
    await dataSource.signOut()
    queryClient.clear()
    await navigate({ to: "/login" })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-2" />}>
        <span className="hidden max-w-48 truncate sm:inline">{me.email}</span>
        <Badge variant="secondary">{ROLE_LABEL[me.role]}</Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate font-medium text-foreground">{me.name}</div>
            <div className="truncate text-xs font-normal">{me.email}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>外观</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(v) => setTheme(v as string)}>
            <DropdownMenuRadioItem value="light">
              <SunIcon /> 浅色
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <MoonIcon /> 深色
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <MonitorIcon /> 跟随系统
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {dataSource.isSample && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>示例数据：切换角色</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={me.role}
                onValueChange={(v) => {
                  setSampleRole(v as Role)
                  void queryClient.invalidateQueries({ queryKey: queryKeys.me })
                }}
              >
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <DropdownMenuRadioItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOutIcon /> 退出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
