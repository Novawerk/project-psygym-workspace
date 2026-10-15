import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"

import { Page } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/labels"
import { casesQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/_app/cases/")({
  component: CasesPage,
})

function CasesPage() {
  const { data: cases } = useQuery(casesQueryOptions)

  return (
    <Page title="病例" description="App 里能选的病例。发布后 App 一分钟内用上新版本。">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>id</TableHead>
              <TableHead>已发布版本</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">最后改动</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!cases &&
              [0, 1].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {cases?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link to="/cases/$caseId" params={{ caseId: c.id }} className="hover:underline">
                    {c.title.zh}
                  </Link>
                  {c.title.en && <div className="text-xs font-normal text-muted-foreground">{c.title.en}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{c.id}</TableCell>
                <TableCell>{c.publishedVersion ? `v${c.publishedVersion}` : "未发布"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {c.hasDraft && <Badge variant="secondary">有草稿</Badge>}
                    {c.missingEnglish && <Badge variant="outline">英文缺失</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{formatDateTime(c.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Page>
  )
}
