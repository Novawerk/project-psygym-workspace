import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"

import { Page } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ACTION_LABEL, formatDateTime } from "@/lib/labels"
import { releasesQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/_app/releases")({
  component: ReleasesPage,
})

/** Every publish and rollback, newest first. Also shows whether the export to GitHub went through. */
function ReleasesPage() {
  const { data: releases } = useQuery(releasesQueryOptions)

  return (
    <Page title="发布记录" description="每次发布和回滚都留在这里，同时在 #project-psygym 发通知。">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>内容</TableHead>
              <TableHead>版本</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>谁</TableHead>
              <TableHead>同步到 GitHub</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {releases?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{formatDateTime(r.at)}</TableCell>
                <TableCell>
                  <span className="mr-2 text-xs text-muted-foreground">{r.kind === "case" ? "病例" : "督导标准"}</span>
                  {r.kind === "case" ? (
                    <Link to="/cases/$caseId" params={{ caseId: r.contentId }} className="font-mono text-xs hover:underline">
                      {r.contentId}
                    </Link>
                  ) : (
                    <Link to="/rubrics/$rubricId" params={{ rubricId: r.contentId }} className="font-mono text-xs hover:underline">
                      {r.contentId}
                    </Link>
                  )}
                </TableCell>
                <TableCell>v{r.version}</TableCell>
                <TableCell>
                  <Badge variant={r.action === "rollback" ? "outline" : "secondary"}>{ACTION_LABEL[r.action]}</Badge>
                </TableCell>
                <TableCell>{r.by}</TableCell>
                <TableCell>
                  {r.synced ? (
                    <span className="text-muted-foreground">已同步</span>
                  ) : (
                    <Badge variant="destructive">未同步</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Page>
  )
}
