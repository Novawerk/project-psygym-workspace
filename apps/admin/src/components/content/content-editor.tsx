import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useBlocker } from "@tanstack/react-router"
import { toast } from "sonner"

import { BodyEditor } from "@/components/content/body-editor"
import { CardFields, type FieldErrors } from "@/components/content/case-fields"
import { HistoryPanel, type HistoryFocus } from "@/components/content/history-panel"
import { PreviewPanel } from "@/components/content/preview-panel"
import { useCrumbs } from "@/components/crumbs"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMe } from "@/hooks/use-me"
import { ApiError, isConflict, isDraftOutdated } from "@/lib/api"
import { formFromFrontmatter, frontmatterFromForm, problemTarget, toSource, type Form } from "@/lib/content"
import { dataSource } from "@/lib/data-source"
import { COPY, KIND_LABEL, formatTime } from "@/lib/labels"
import { itemQueryOptions, queryKeys } from "@/lib/queries"
import type { ContentDetail, Kind, Problem } from "@/lib/types"

const FIELD_LABEL: Record<string, string> = {
  title: "标题",
  summary: "简介",
  clientAlias: "化名",
  tags: "主题标签",
  difficulty: "难度",
  estimatedMinutes: "预计时长",
  clientIntro: "来访者",
  practiceFocus: "这次练什么",
  contentNotes: "内容提示",
  body: "给 AI 的角色说明",
  source: "文件格式",
}

type Edit = { form: Form; body: string }

function editFrom(kind: Kind, d: ContentDetail): Edit {
  const doc = d.draft ?? d.published
  return { form: formFromFrontmatter(kind, doc?.frontmatter ?? null), body: doc?.body ?? "" }
}

export function ContentEditor({ kind, id, version }: { kind: Kind; id: string; version?: number }) {
  const { data, error } = useQuery(itemQueryOptions(kind, id))
  useCrumbs([
    { label: KIND_LABEL[kind], to: kind === "case" ? "/cases" : "/rubrics" },
    { label: id, mono: true },
  ])
  if (error)
    return <p className="p-8 text-sm text-muted-foreground">{error instanceof ApiError && error.status === 404 ? "找不到这一份。" : COPY.error}</p>
  if (!data)
    return (
      <div className="flex flex-col gap-4 p-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-96" />
        <span className="sr-only">{COPY.loading}</span>
      </div>
    )
  return <Editor kind={kind} id={id} data={data} openVersion={version} />
}

function Editor({ kind, id, data, openVersion }: { kind: Kind; id: string; data: ContentDetail; openVersion?: number }) {
  const me = useMe()
  const queryClient = useQueryClient()
  const initial = React.useMemo(() => editFrom(kind, data), [kind, data])
  const [edit, setEdit] = React.useState(initial)
  // New server state (a publish, a refetch) replaces the form only when it had no unsaved edits:
  // someone's typing is never thrown away behind their back. A save sets the form itself.
  const shown = React.useRef(initial)
  React.useEffect(() => {
    const unsaved = JSON.stringify(edit) !== JSON.stringify(shown.current)
    shown.current = initial
    if (!unsaved) setEdit(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])
  const dirty = JSON.stringify(edit) !== JSON.stringify(initial)
  // A link from the publish log (?v=3) opens the version history at that version.
  const [panel, setPanel] = React.useState<null | "preview" | "history">(openVersion ? "history" : null)
  const [focus, setFocus] = React.useState<HistoryFocus | undefined>(openVersion ? { version: openVersion } : undefined)
  const [publishing, setPublishing] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [discarding, setDiscarding] = React.useState(false)
  const [banner, setBanner] = React.useState<
    | { type: "conflict"; email: string; at: string }
    | { type: "outdated"; from: number; to: number }
    | { type: "published"; version: number }
    | null
  >(null)

  const published = data.published
  const draft = data.draft
  // A refused publish (422) shows the backend's own errors until the next save.
  const [publishProblems, setPublishProblems] = React.useState<Problem[] | null>(null)
  const problems: Problem[] = publishProblems ?? draft?.errors ?? []
  const errors = fieldErrors(problems)
  const readOnly = !me.canWrite
  const title = (published?.frontmatter as { title?: { zh?: string } } | null)?.title?.zh || edit.form.title.zh || id

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.content })
  const fetchFresh = () => queryClient.fetchQuery({ ...itemQueryOptions(kind, id), staleTime: 0 })
  /** Reads the latest state without touching the cache, so the form keeps the unsaved edits. */
  const peek = () => dataSource.content(kind, id)
  const reload = async () => {
    const fresh = await fetchFresh()
    setEdit(editFrom(kind, fresh))
    setBanner(null)
  }

  const frontmatter = () => frontmatterFromForm(kind, id, edit.form, (draft ?? published)?.frontmatter ?? null)

  const save = useMutation({
    mutationFn: (opts: { rebase?: true } = {}) =>
      dataSource.saveDraft(kind, id, { draftRevision: draft?.revision ?? null, ...opts, frontmatter: frontmatter(), body: edit.body }),
    onSuccess: (next) => {
      setPublishProblems(null)
      setEdit(editFrom(kind, next))
      queryClient.setQueryData(queryKeys.item(kind, id), next)
      void queryClient.invalidateQueries({ queryKey: queryKeys.list(kind) })
      toast.success("草稿已保存")
    },
    onError: async (e) => {
      if (isConflict(e)) {
        const fresh = await peek().catch(() => null)
        setBanner({ type: "conflict", email: fresh?.draft?.updatedBy?.email ?? "别人", at: formatTime(fresh?.draft?.updatedAt) })
      } else toast.error(COPY.error)
    },
  })

  const publish = useMutation({
    mutationFn: () =>
      dataSource.publish(kind, id, {
        draftRevision: draft!.revision,
        basePublishedVersion: published?.version ?? null,
        note: note.trim() || undefined,
      }),
    onSuccess: async (v) => {
      setPublishing(false)
      setNote("")
      toast.success(`已发布 v${v.version}`)
      await refresh()
    },
    onError: async (e) => {
      setPublishing(false)
      const fresh = await fetchFresh().catch(() => null)
      if (isDraftOutdated(e)) setBanner({ type: "outdated", from: draft?.baseVersion ?? 0, to: fresh?.published?.version ?? 0 })
      else if (isConflict(e)) setBanner({ type: "published", version: fresh?.published?.version ?? 0 })
      else if (e instanceof ApiError && e.status === 422) setPublishProblems(e.errors.length ? e.errors : null)
      else toast.error(COPY.error)
    },
  })

  const discard = useMutation({
    mutationFn: () => dataSource.discardDraft(kind, id, draft!.revision),
    onSuccess: async () => {
      setDiscarding(false)
      await refresh()
    },
    onError: async (e) => {
      setDiscarding(false)
      if (!isConflict(e)) return void toast.error(COPY.error)
      // Never discard after the refresh on its own: the colleague's save shows first.
      const fresh = await fetchFresh().catch(() => null)
      const who = fresh?.draft?.updatedBy?.email ?? "别人"
      toast.error(`草稿刚被 ${who} 改过，已刷新。还要放弃的话，再点一次「放弃草稿」。`, { duration: 10_000 })
    },
  })

  // Saving first when there are unsaved edits; a draft that still has errors can't go out.
  const startPublish = async () => {
    if (dirty) {
      const next = await save.mutateAsync({}).catch(() => null)
      if (!next?.draft || next.draft.errors.length) return
    }
    setPublishing(true)
  }

  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: () => dirty, withResolver: true })

  const nextVersion = (published?.version ?? 0) + 1
  const canPublish = (dirty || Boolean(draft)) && (dirty || problems.length === 0)
  const publishHint = !dirty && problems.length ? "先改完标出的问题" : !dirty && !draft ? "没有要发布的改动" : null

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b bg-background px-8 py-3.5">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate text-xl font-bold">{title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{published ? `已发布 v${published.version}` : "未发布"}</Badge>
              <span className="text-muted-foreground">
                {draft ? `有未发布的草稿 · ${formatTime(draft.updatedAt).slice(11)} 保存` : "没有草稿"}
              </span>
              {dirty && <span className="text-warning-fg">有改动还没保存</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setFocus(undefined); setPanel(panel === "history" ? null : "history") }}>
              版本历史
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPanel(panel === "preview" ? null : "preview")}>
              预览
            </Button>
            {me.canWrite && (
              <>
                {draft && !dirty && (
                  <Button variant="ghost" size="sm" onClick={() => setDiscarding(true)}>
                    放弃草稿
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate({})}>
                  保存草稿
                </Button>
                <Tooltip>
                  <TooltipTrigger render={<span tabIndex={publishHint ? 0 : -1} />}>
                    <Button size="sm" disabled={!canPublish || save.isPending} onClick={() => void startPublish()}>
                      发布
                    </Button>
                  </TooltipTrigger>
                  {publishHint && <TooltipContent>{publishHint}</TooltipContent>}
                </Tooltip>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5 px-8 py-6">
          {readOnly && <Callout>{COPY.readOnly}</Callout>}
          {banner?.type === "conflict" && (
            <Callout tone="error">
              <span>草稿已被 {banner.email} 在 {banner.at} 修改。复制你的改动，刷新后再改。</span>
              <Button size="sm" variant="outline" className="mt-2 self-start" onClick={() => void reload()}>
                刷新
              </Button>
            </Callout>
          )}
          {banner?.type === "published" && (
            <Callout tone="error">这期间有人发布了 v{banner.version}。刷新后再发布。</Callout>
          )}
          {banner?.type === "outdated" && (
            <Callout tone="warning">
              <span>
                你的草稿是在 v{banner.from} 上改的，这期间有了 v{banner.to}。先看 v{banner.to} 改了什么，把需要的改动合进草稿，再发布。
              </span>
              <span className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setFocus({ version: banner.to, compareTo: banner.from, mode: "diff" }); setPanel("history") }}>
                  看 v{banner.to} 改了什么
                </Button>
                <Button size="sm" onClick={() => save.mutate({ rebase: true }, { onSuccess: () => setBanner(null) })}>
                  已合并，更新草稿
                </Button>
              </span>
            </Callout>
          )}
          {problems.length > 0 && !readOnly && (
            <Callout tone="error">
              <span className="font-semibold">有 {problems.length} 处要改</span>
              <span className="flex flex-wrap gap-x-3">
                {problems.map((p, i) => {
                  const t = problemTarget(p)
                  return (
                    <button key={i} type="button" className="underline-offset-2 hover:underline"
                      onClick={() => document.getElementById(`field-${t.field}-${t.side ?? "zh"}`)?.focus()}>
                      {FIELD_LABEL[t.field] ?? t.field}
                      {t.side === "en" ? "（英文）" : ""}：{p.message} ›
                    </button>
                  )
                })}
              </span>
            </Callout>
          )}
          <CardFields kind={kind} form={edit.form} onChange={(form) => setEdit((e) => ({ ...e, form }))} errors={errors} readOnly={readOnly} />
          <BodyEditor kind={kind} value={edit.body} onChange={(body) => setEdit((e) => ({ ...e, body }))} error={errors.body?.field ?? errors.body?.zh} readOnly={readOnly} />
        </div>
      </div>

      {panel === "preview" && (
        <PreviewPanel
          kind={kind}
          id={id}
          form={edit.form}
          body={edit.body}
          source={dirty ? toSource(frontmatter(), edit.body) : undefined}
          canChat={me.canWrite}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "history" && (
        <HistoryPanel kind={kind} id={id} current={published?.version ?? null} canRestore={me.canWrite} focus={focus} onClose={() => setPanel(null)} />
      )}

      <AlertDialog open={publishing} onOpenChange={setPublishing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>发布 {id} v{nextVersion}？</AlertDialogTitle>
            <AlertDialogDescription>
              App 会在一分钟内用上这个版本。发布会记录在发布记录里，并在 Slack #project-psygym 发一条通知。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="publish-note">改了什么（可选，只写进发布记录）</Label>
            <Textarea id="publish-note" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={publish.isPending} onClick={() => publish.mutate()}>
              发布
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃草稿？</AlertDialogTitle>
            <AlertDialogDescription>没发布的改动会丢掉。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={discard.isPending} onClick={() => discard.mutate()}>
              放弃
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker.status === "blocked"} onOpenChange={(o) => !o && blocker.reset?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有改动还没保存，确定离开吗？</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>留下</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>离开</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function fieldErrors(problems: Problem[]): FieldErrors {
  const out: FieldErrors = {}
  for (const p of problems) {
    const t = problemTarget(p)
    const slot = (out[t.field] ??= {})
    if (t.side) slot[t.side] ??= p.message
    else slot.field ??= p.message
  }
  return out
}

function Callout({ tone, children }: { tone?: "error" | "warning"; children: React.ReactNode }) {
  const cls =
    tone === "error"
      ? "border-destructive/60 bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "border-warning-fg/40 bg-warning-bg text-warning-fg"
        : "bg-muted text-muted-foreground"
  return (
    <div role={tone ? "alert" : undefined} className={`flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  )
}
