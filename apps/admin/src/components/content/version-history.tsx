import { HistoryIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ACTION_LABEL, formatDateTime } from "@/lib/labels"
import type { ContentVersion } from "@/lib/types"

/** Drawer listing published versions. "恢复成这个版本" makes a new version (a rollback). */
export function VersionHistory({
  versions,
  current,
  canRestore,
}: {
  versions: ContentVersion[]
  current: number | null
  canRestore: boolean
}) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <HistoryIcon /> 版本历史
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>版本历史</SheetTitle>
          <SheetDescription>旧版本不删。恢复旧版本会生成一个新版本，同样留痕、发通知。</SheetDescription>
        </SheetHeader>
        <ol className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {versions.map((v) => (
            <li key={v.version} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{v.version}</span>
                  <Badge variant={v.action === "rollback" ? "outline" : "secondary"}>
                    {ACTION_LABEL[v.action]}
                    {v.restoredFrom ? ` ← v${v.restoredFrom}` : ""}
                  </Badge>
                  {v.version === current && <Badge>当前</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(v.at)} · {v.by}
                </span>
              </div>
              {canRestore && v.version !== current && (
                <Button variant="ghost" size="sm" onClick={() => toast("恢复：等接口合同。")}>
                  恢复成这个版本
                </Button>
              )}
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  )
}
