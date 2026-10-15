import type * as React from "react"

import { cn } from "@/lib/utils"

/** Every page: a title row (with actions on the right) and a scrolling body. */
export function Page({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className={cn("flex flex-col gap-6 px-6 pb-10", className)}>{children}</div>
    </div>
  )
}

/** Shown where a screen waits on the admin API contract. */
export function PendingContract({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>
  )
}
