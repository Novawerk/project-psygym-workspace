import type { LinkProps } from "@tanstack/react-router"
import { ChartLineIcon, ClipboardCheckIcon, FileTextIcon, HistoryIcon, type LucideIcon } from "lucide-react"

export type NavItem = { title: string; to: NonNullable<LinkProps["to"]>; icon: LucideIcon }

export const NAV: NavItem[] = [
  { title: "数据看板", to: "/", icon: ChartLineIcon },
  { title: "病例", to: "/cases", icon: FileTextIcon },
  { title: "督导标准", to: "/rubrics", icon: ClipboardCheckIcon },
  { title: "发布记录", to: "/releases", icon: HistoryIcon },
]

export function isActive(item: NavItem, pathname: string) {
  if (item.to === "/") return pathname === "/"
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}
