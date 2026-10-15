import type * as React from "react"

import { useCrumbs, type Crumb } from "@/components/crumbs"
import { cn } from "@/lib/utils"

/** Every page: crumbs in the top bar, a title row (actions on the right), a scrolling body. */
export function Page({
  crumbs,
  title,
  description,
  actions,
  children,
  className,
}: {
  crumbs: Crumb[]
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  useCrumbs(crumbs)
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 px-8 pt-7 pb-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={cn("flex flex-col gap-5 px-8 pb-10", className)}>{children}</div>
    </div>
  )
}
