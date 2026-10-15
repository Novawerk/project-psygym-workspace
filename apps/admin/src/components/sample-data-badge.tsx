import { FlaskConicalIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { dataSource } from "@/lib/data-source"

export function SampleDataBadge() {
  if (!dataSource.isSample) return null
  return (
    <Badge variant="outline" className="gap-1">
      <FlaskConicalIcon /> 示例数据
    </Badge>
  )
}
