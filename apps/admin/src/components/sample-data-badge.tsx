import { dataSource } from "@/lib/data-source"

export function SampleDataBadge() {
  if (!dataSource.isSample) return null
  return <span className="rounded border border-dashed px-2 py-0.5 text-xs text-muted-foreground">示例数据</span>
}
