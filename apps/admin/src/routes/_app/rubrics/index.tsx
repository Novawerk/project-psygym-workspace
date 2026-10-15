import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"

import { Page } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/labels"
import { rubricsQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/_app/rubrics/")({
  component: RubricsPage,
})

function RubricsPage() {
  const { data: rubrics } = useQuery(rubricsQueryOptions)

  return (
    <Page title="督导标准" description="AI 督导按病例的流派挑一份标准来评。">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>流派</TableHead>
              <TableHead>已发布版本</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">最后改动</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rubrics?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link to="/rubrics/$rubricId" params={{ rubricId: r.id }} className="hover:underline">
                    {r.title.zh}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs uppercase">{r.school}</TableCell>
                <TableCell>{r.publishedVersion ? `v${r.publishedVersion}` : "未发布"}</TableCell>
                <TableCell>{r.hasDraft && <Badge variant="secondary">有草稿</Badge>}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatDateTime(r.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Page>
  )
}
