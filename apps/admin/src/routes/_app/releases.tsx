import { useInfiniteQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"

import { Page } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dataSource } from "@/lib/data-source"
import { COPY, KIND_LABEL, ROLE_LABEL, actionLabel, formatTime } from "@/lib/labels"
import { queryKeys } from "@/lib/queries"
import type { PublishLogEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/releases")({
  component: ReleasesPage,
})

/** Every import, publish and rollback, newest first. */
function ReleasesPage() {
  const log = useInfiniteQuery({
    queryKey: queryKeys.publishLog,
    queryFn: ({ pageParam }) => dataSource.publishLog(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
  const entries = log.data?.pages.flatMap((p) => p.entries)

  return (
    <Page
      crumbs={[{ label: "发布记录" }]}
      title="发布记录"
      description="病例和督导标准的每次发布、回滚，按时间倒序。每条也会在 Slack #project-psygym 发一条通知。"
    >
      {entries && entries.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">还没有发布记录。</div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-sidebar">
              <TableRow>
                <TableHead className="px-4">时间</TableHead>
                <TableHead className="px-4">类型</TableHead>
                <TableHead className="px-4">id 和版本</TableHead>
                <TableHead className="px-4">操作</TableHead>
                <TableHead className="px-4">发布人</TableHead>
                <TableHead className="px-4">改了什么</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.error && (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{COPY.error}</TableCell>
                </TableRow>
              )}
              {!entries && !log.error &&
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6} className="px-4"><Skeleton className="h-8" /></TableCell>
                  </TableRow>
                ))}
              {entries?.map((e) => <Row key={`${e.kind}-${e.id}-${e.version}`} e={e} />)}
            </TableBody>
          </Table>
        </div>
      )}
      {log.hasNextPage && (
        <Button variant="outline" className="self-center" disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>
          再看 50 条
        </Button>
      )}
    </Page>
  )
}

function Row({ e }: { e: PublishLogEntry }) {
  const tone =
    e.action === "rollback" ? "bg-warning-bg text-warning-fg" : e.action === "import" ? "bg-muted text-muted-foreground" : "bg-success-bg text-success-fg"
  return (
    <TableRow>
      <TableCell className="px-4 py-3 whitespace-nowrap text-foreground/80">{formatTime(e.publishedAt)}</TableCell>
      <TableCell className="px-4">{KIND_LABEL[e.kind]}</TableCell>
      <TableCell className="px-4">
        <Link
          to={e.kind === "case" ? "/cases/$caseId" : "/rubrics/$rubricId"}
          params={e.kind === "case" ? { caseId: e.id } : { rubricId: e.id }}
          className="font-mono text-xs hover:underline"
        >
          {e.id} v{e.version}
        </Link>
      </TableCell>
      <TableCell className="px-4">
        <span className={cn("rounded px-2 py-0.5 text-xs whitespace-nowrap", tone)}>{actionLabel(e)}</span>
      </TableCell>
      <TableCell className="px-4">
        {e.publishedBy ? (
          <div className="flex flex-col">
            <span>{e.publishedBy.email}</span>
            <span className="text-xs text-muted-foreground">{ROLE_LABEL[e.publishedBy.role]}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">{e.action === "import" ? "切换日导入" : "—"}</span>
        )}
      </TableCell>
      <TableCell className="px-4 text-foreground/80">{e.note ?? ""}</TableCell>
    </TableRow>
  )
}

