import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ChevronRightIcon, PlusIcon } from "lucide-react"

import { Page } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMe } from "@/hooks/use-me"
import { ApiError, isConflict } from "@/lib/api"
import { newCaseTemplate } from "@/lib/content"
import { dataSource } from "@/lib/data-source"
import { COPY, KIND_LABEL, formatTime } from "@/lib/labels"
import { listQueryOptions, queryKeys } from "@/lib/queries"
import type { ContentItem, Kind } from "@/lib/types"

const DESCRIPTION: Record<Kind, string> = {
  case: "App 读的是每个病例最新的已发布版本。草稿只在后台看得到。",
  rubric: "AI 督导按病例的流派用对应的标准。草稿只在后台看得到。",
}

export function ContentList({ kind }: { kind: Kind }) {
  const me = useMe()
  const { data: items, error } = useQuery(listQueryOptions(kind))
  const [creating, setCreating] = React.useState(false)

  return (
    <Page
      crumbs={[{ label: KIND_LABEL[kind] }]}
      title={KIND_LABEL[kind]}
      description={DESCRIPTION[kind]}
      actions={
        kind === "case" &&
        me.canWrite && (
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> 新建病例
          </Button>
        )
      }
    >
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-sidebar">
            <TableRow>
              <TableHead className="px-4">标题</TableHead>
              <TableHead className="px-4">已发布版本</TableHead>
              <TableHead className="px-4">发布时间</TableHead>
              <TableHead className="px-4">草稿</TableHead>
              <TableHead className="px-4">提示</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {error && (
              <TableRow>
                <TableCell colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{COPY.error}</TableCell>
              </TableRow>
            )}
            {!items && !error &&
              [0, 1].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6} className="px-4">
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {items?.map((item) => <Row key={item.id} item={item} />)}
          </TableBody>
        </Table>
      </div>
      {kind === "rubric" && <p className="text-sm text-muted-foreground">第一期只有 CBT 一份，不能新建。</p>}
      {creating && <NewCaseDialog onClose={() => setCreating(false)} />}
    </Page>
  )
}

function Row({ item }: { item: ContentItem }) {
  const navigate = useNavigate()
  const open = () =>
    item.kind === "case"
      ? navigate({ to: "/cases/$caseId", params: { caseId: item.id } })
      : navigate({ to: "/rubrics/$rubricId", params: { rubricId: item.id } })
  return (
    <TableRow className="cursor-pointer" onClick={() => void open()}>
      <TableCell className="px-4 py-3">
        <Link
          to={item.kind === "case" ? "/cases/$caseId" : "/rubrics/$rubricId"}
          params={item.kind === "case" ? { caseId: item.id } : { rubricId: item.id }}
          className="flex flex-col gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="font-semibold">{item.title.zh || "（未命名）"}</span>
          <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
        </Link>
      </TableCell>
      <TableCell className="px-4">
        <Badge variant="outline" className={item.publishedVersion ? "" : "text-muted-foreground"}>
          {item.publishedVersion ? `v${item.publishedVersion}` : "未发布"}
        </Badge>
      </TableCell>
      <TableCell className="px-4 text-foreground/80">{formatTime(item.publishedAt)}</TableCell>
      <TableCell className="px-4">
        {item.hasDraft ? (
          <div className="flex flex-col">
            <span>有草稿</span>
            <span className="text-xs text-muted-foreground">{formatTime(item.draftUpdatedAt)} 修改</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="px-4">
        {item.enMissing && <span className="rounded bg-warning-bg px-2 py-0.5 text-xs text-warning-fg">英文缺失</span>}
      </TableCell>
      <TableCell className="pr-3 text-muted-foreground">
        <ChevronRightIcon className="size-4" />
      </TableCell>
    </TableRow>
  )
}

function NewCaseDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [id, setId] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const valid = /^[a-z0-9-]{3,64}$/.test(id)

  const create = useMutation({
    mutationFn: () => {
      const t = newCaseTemplate(id)
      return dataSource.createCase(id, t.frontmatter, t.body)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.list("case") })
      onClose()
      await navigate({ to: "/cases/$caseId", params: { caseId: id } })
    },
    onError: (e) => setError(isConflict(e) ? "这个 id 已经有了。" : e instanceof ApiError && e.status === 400 ? "id 格式不对。" : COPY.error),
  })

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) create.mutate()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>新建病例</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-case-id">id</Label>
            <Input
              id="new-case-id"
              autoFocus
              value={id}
              onChange={(e) => {
                setId(e.target.value.trim())
                setError(null)
              }}
              placeholder="cbt-depression-02"
              className="font-mono text-sm"
              aria-invalid={Boolean(error)}
            />
            <p className="text-xs text-muted-foreground">小写英文、数字、连字符，定了不改。例：cbt-depression-02</p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-case-school">流派</Label>
            <Input id="new-case-school" value="CBT" readOnly />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">取消</AlertDialogCancel>
            <Button type="submit" disabled={!valid || create.isPending}>
              创建草稿
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
