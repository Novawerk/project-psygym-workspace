import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { SidePanel } from "@/components/content/side-panel"
import { Segmented } from "@/components/segmented"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, isConflict } from "@/lib/api"
import { dataSource } from "@/lib/data-source"
import { compact, diffLines } from "@/lib/diff"
import { COPY, ROLE_LABEL, actionLabel, formatTime } from "@/lib/labels"
import { queryKeys, versionQueryOptions, versionsQueryOptions } from "@/lib/queries"
import type { Kind } from "@/lib/types"
import { cn } from "@/lib/utils"

export type HistoryFocus = { version: number; compareTo?: number; mode?: "full" | "diff" }

/** 「版本历史」: every version; one opened with its full text and its diff; 「恢复成这个版本」. */
export function HistoryPanel({
  kind,
  id,
  current,
  canRestore,
  focus,
  onClose,
}: {
  kind: Kind
  id: string
  current: number | null
  canRestore: boolean
  focus?: HistoryFocus
  onClose: () => void
}) {
  const { data: versions } = useQuery(versionsQueryOptions(kind, id))
  const [selected, setSelected] = React.useState<HistoryFocus | null>(focus ?? null)
  React.useEffect(() => {
    setSelected(focus ?? null)
  }, [focus])

  // Default: the newest version that isn't current, compared with the current one.
  const sel = selected ?? (versions && versions.length ? { version: (versions[1] ?? versions[0]).version } : null)

  return (
    <SidePanel title="版本历史" onClose={onClose} closeLabel="关闭版本历史" className="w-[460px]">
      <div className="flex flex-col gap-2 p-3">
        {!versions && <Skeleton className="h-16" />}
        {versions?.map((v) => (
          <button
            type="button"
            key={v.version}
            onClick={() => setSelected({ version: v.version })}
            aria-pressed={sel?.version === v.version}
            className={cn(
              "flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left",
              sel?.version === v.version ? "bg-background" : "border-transparent hover:bg-background/60",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">
                v{v.version} <span className="font-normal text-muted-foreground">{actionLabel(v)}</span>
              </span>
              {v.version === current && <span className="text-xs text-success-fg">当前版本</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatTime(v.publishedAt)} ·{" "}
              {v.publishedBy ? `${v.publishedBy.email} · ${ROLE_LABEL[v.publishedBy.role]}` : v.action === "import" ? "导入" : "—"}
            </span>
            {v.note && <span className="text-xs text-foreground/80">{v.note}</span>}
          </button>
        ))}
      </div>
      {sel && current !== null && (
        <VersionDetail
          key={`${sel.version}-${sel.compareTo}`}
          kind={kind}
          id={id}
          version={sel.version}
          compareTo={sel.compareTo ?? current}
          defaultMode={sel.mode ?? (sel.version === current ? "full" : "diff")}
          current={current}
          canRestore={canRestore}
        />
      )}
    </SidePanel>
  )
}

function VersionDetail({
  kind,
  id,
  version,
  compareTo,
  defaultMode,
  current,
  canRestore,
}: {
  kind: Kind
  id: string
  version: number
  compareTo: number
  defaultMode: "full" | "diff"
  current: number
  canRestore: boolean
}) {
  const [mode, setMode] = React.useState(defaultMode)
  const [confirming, setConfirming] = React.useState(false)
  const queryClient = useQueryClient()
  const { data: doc } = useQuery(versionQueryOptions(kind, id, version))
  const { data: other } = useQuery({ ...versionQueryOptions(kind, id, compareTo), enabled: compareTo !== version })

  const restore = useMutation({
    mutationFn: () => dataSource.rollback(kind, id, { toVersion: version, basePublishedVersion: current }),
    onSuccess: async (v) => {
      toast.success(`已恢复，生成 v${v.version}`)
      setConfirming(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.content })
    },
    onError: async (e) => {
      setConfirming(false)
      if (e instanceof ApiError && e.status === 422)
        toast.error(`v${version} 不符合现在的校验规则，不能直接恢复。把需要的内容复制进草稿，改好后再发布。`)
      else if (isConflict(e)) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.content })
        const latest = await dataSource.versions(kind, id)
        toast.error(`这期间有人发布了 v${latest[0]?.version}。刷新后再发布。`)
      } else toast.error(COPY.error)
    },
  })

  // Older on the left: a diff reads "what changed from the older one to the newer one".
  const [before, after] = version < compareTo ? [doc, other] : [other, doc]
  const lines = React.useMemo(
    () => (mode === "diff" && before && after ? compact(diffLines(before.source, after.source)) : null),
    [mode, before, after],
  )
  const lo = Math.min(version, compareTo)
  const hi = Math.max(version, compareTo)

  return (
    <div className="flex flex-col gap-2.5 border-t p-4">
      <div className="flex items-center justify-between gap-2">
        <Segmented
          label="看版本"
          value={mode}
          onChange={setMode}
          options={[
            { value: "full", label: "全文" },
            ...(compareTo !== version ? [{ value: "diff" as const, label: "和当前版本的差异" }] : []),
          ]}
        />
        {mode === "diff" && (
          <span className="text-xs text-muted-foreground">
            v{lo} → {hi === current ? `当前 v${hi}` : `v${hi}`}
          </span>
        )}
      </div>
      {!doc ? (
        <Skeleton className="h-40" />
      ) : mode === "full" || compareTo === version ? (
        <pre className="max-h-[420px] overflow-auto rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {doc.source}
        </pre>
      ) : !lines ? (
        <Skeleton className="h-40" />
      ) : (
        <pre className="max-h-[420px] overflow-auto rounded-lg border bg-background py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {lines.length === 0 || lines.every((l) => l?.op === " ") ? (
            <span className="block px-3 text-muted-foreground">没有差异。</span>
          ) : (
            lines.map((l, i) =>
              l === null ? (
                <span key={i} className="block px-3 text-muted-foreground">…</span>
              ) : (
                <span
                  key={i}
                  className={cn("block px-3", l.op === "+" && "bg-diff-add", l.op === "-" && "bg-diff-del")}
                >
                  {l.op} {l.text}
                </span>
              ),
            )
          )}
        </pre>
      )}
      {canRestore && version !== current && (
        <Button variant="outline" className="self-start" onClick={() => setConfirming(true)}>
          恢复成这个版本
        </Button>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>恢复成 v{version}？</AlertDialogTitle>
            <AlertDialogDescription>
              把 v{version} 的内容发布成 v{current + 1}？App 会在一分钟内用上。有草稿的话，草稿会落后于新版本，要先「已合并，更新草稿」才能发布。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={restore.isPending} onClick={() => restore.mutate()}>
              恢复
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
