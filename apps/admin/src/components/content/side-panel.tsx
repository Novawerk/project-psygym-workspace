import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** The editor's right-hand panel (preview, version history). Sits beside the form, not over it. */
export function SidePanel({
  title,
  toolbar,
  onClose,
  closeLabel,
  className,
  children,
}: {
  title?: React.ReactNode
  toolbar?: React.ReactNode
  onClose: () => void
  closeLabel: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <aside className={cn("flex min-h-0 w-[420px] shrink-0 flex-col border-l bg-sidebar", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        {title && <h2 className="text-base font-semibold">{title}</h2>}
        {toolbar}
        <Button variant="ghost" size="icon-sm" aria-label={closeLabel} onClick={onClose} className="ml-auto">
          <XIcon />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </aside>
  )
}
