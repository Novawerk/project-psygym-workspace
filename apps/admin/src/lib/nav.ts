import type { LinkProps } from "@tanstack/react-router"
import { ChartLineIcon, ClipboardCheckIcon, CpuIcon, FileTextIcon, HistoryIcon, UsersIcon, type LucideIcon } from "lucide-react"

import type { Role } from "./types"

export type NavItem = { title: string; to: NonNullable<LinkProps["to"]>; icon: LucideIcon; roles?: Role[] }

export const NAV: NavItem[] = [
  { title: "数据看板", to: "/", icon: ChartLineIcon },
  { title: "病例", to: "/cases", icon: FileTextIcon },
  { title: "督导标准", to: "/rubrics", icon: ClipboardCheckIcon },
  { title: "发布记录", to: "/releases", icon: HistoryIcon },
  { title: "成员", to: "/people", icon: UsersIcon, roles: ["admin"] },
  { title: "模型设置", to: "/models", icon: CpuIcon, roles: ["admin"] },
]

export const navFor = (role: Role) => NAV.filter((item) => !item.roles || item.roles.includes(role))

export function isActive(item: NavItem, pathname: string) {
  if (item.to === "/") return pathname === "/"
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}
