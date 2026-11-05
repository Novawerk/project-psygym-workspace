import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CopyIcon, UserPlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Page } from "@/components/page"
import { Segmented } from "@/components/segmented"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMe } from "@/hooks/use-me"
import { ApiError, isConflict } from "@/lib/api"
import { dataSource } from "@/lib/data-source"
import { COPY, ORG_LABEL, ROLE_HINT, ROLE_LABEL, canManagePeople, formatTime } from "@/lib/labels"
import { peopleQueryOptions, queryKeys } from "@/lib/queries"
import type { Org, Person, PersonPatch, Role } from "@/lib/types"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/people")({
  component: PeoplePage,
})

const ADMIN_URL = "https://admin.psygym.novawerk.io"
const ROLES: Role[] = ["editor", "viewer", "admin"]
const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))

/** Who can sign in to the admin. Adding an email is the invitation (Google sign-in). */
function PeoplePage() {
  const me = useMe()
  const allowed = canManagePeople(me.role)
  const { data: people, error } = useQuery({ ...peopleQueryOptions, enabled: allowed })
  const [adding, setAdding] = React.useState(false)

  if (!allowed) {
    return (
      <Page crumbs={[{ label: "成员" }]} title="成员">
        <p className="text-sm text-muted-foreground">只有管理员能管理成员。需要加人请找你们的管理员。</p>
      </Page>
    )
  }

  return (
    <Page
      crumbs={[{ label: "成员" }]}
      title="成员"
      description={
        me.org === "novawerk"
          ? "谁能登录后台。加上邮箱就是邀请：对方用这个 Google 账号登录。停用后马上退出。"
          : `${ORG_LABEL[me.org]}的成员。加上邮箱就是邀请：对方用这个 Google 账号登录。停用后马上退出。`
      }
      actions={
        <Button onClick={() => setAdding(true)}>
          <UserPlusIcon /> 添加成员
        </Button>
      }
    >
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-sidebar">
            <TableRow>
              <TableHead className="px-4">邮箱</TableHead>
              <TableHead className="px-4">角色</TableHead>
              <TableHead className="px-4">机构</TableHead>
              <TableHead className="px-4">状态</TableHead>
              <TableHead className="px-4">最近登录</TableHead>
              <TableHead className="px-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {error && (
              <TableRow>
                <TableCell colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{COPY.error}</TableCell>
              </TableRow>
            )}
            {!people && !error &&
              [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6} className="px-4"><Skeleton className="h-8" /></TableCell>
                </TableRow>
              ))}
            {people?.map((p) => <PersonRow key={p.id} p={p} self={p.email === me.email} />)}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">
        {(["editor", "viewer", "admin"] as Role[]).map((r) => `${ROLE_LABEL[r]}：${ROLE_HINT[r]}`).join("；")}。
      </p>
      {adding && <AddPersonDialog myOrg={me.org} onClose={() => setAdding(false)} />}
    </Page>
  )
}

function useUpdatePerson(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: PersonPatch) => dataSource.updatePerson(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.people }),
    onError: () => toast.error(COPY.error),
  })
}

function PersonRow({ p, self }: { p: Person; self: boolean }) {
  const update = useUpdatePerson(p.id)
  const [confirming, setConfirming] = React.useState(false)
  const status = !p.enabled ? "已停用" : p.signedInOnce ? "已登录过" : "还没登录"
  const tone = !p.enabled ? "bg-muted text-muted-foreground" : p.signedInOnce ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg"

  return (
    <TableRow className={cn(!p.enabled && "text-muted-foreground")}>
      <TableCell className="px-4 py-3">
        <span className="font-medium">{p.email}</span>
        {self && <span className="ml-2 text-xs text-muted-foreground">（你）</span>}
      </TableCell>
      <TableCell className="px-4">
        {self || !p.enabled ? (
          ROLE_LABEL[p.role]
        ) : (
          <Select items={roleOptions} value={p.role} onValueChange={(v) => update.mutate({ role: v as Role })}>
            <SelectTrigger size="sm" aria-label={`${p.email} 的角色`} className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </TableCell>
      <TableCell className="px-4">{ORG_LABEL[p.org]}</TableCell>
      <TableCell className="px-4">
        <span className={cn("rounded px-2 py-0.5 text-xs whitespace-nowrap", tone)}>{status}</span>
      </TableCell>
      <TableCell className="px-4 whitespace-nowrap text-foreground/80">{formatTime(p.lastLoginAt)}</TableCell>
      <TableCell className="px-4 text-right">
        {!self &&
          (p.enabled ? (
            <Button variant="ghost" size="sm" disabled={update.isPending} onClick={() => setConfirming(true)}>
              停用
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled={update.isPending} onClick={() => update.mutate({ enabled: true })}>
              恢复
            </Button>
          ))}
        {confirming && (
          <AlertDialog open onOpenChange={(o) => !o && setConfirming(false)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>停用 {p.email}？</AlertDialogTitle>
                <AlertDialogDescription>对方马上退出，不能再登录。发布记录里的名字还在。以后可以恢复。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={() => {
                    update.mutate({ enabled: false })
                    setConfirming(false)
                  }}
                >
                  停用
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </TableCell>
    </TableRow>
  )
}

/** What to send the new person, in your own chat or email. */
const inviteText = (p: Person) =>
  `我把你加进了聆镜 PSYGYM 后台（${ROLE_LABEL[p.role]}）。打开 ${ADMIN_URL} ，用 Google 账号 ${p.email} 登录就行。`

function AddPersonDialog({ myOrg, onClose }: { myOrg: Org; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<Role>("editor")
  const [org, setOrg] = React.useState<Org>(myOrg === "novawerk" ? "lingjing" : myOrg)
  const [error, setError] = React.useState<string | null>(null)
  const [added, setAdded] = React.useState<Person | null>(null)
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const add = useMutation({
    mutationFn: () => dataSource.addPerson({ email: email.trim(), role, org }),
    onSuccess: async (p) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.people })
      setAdded(p)
    },
    onError: (e) => setError(isConflict(e) ? "这个邮箱已经在名单里了。" : e instanceof ApiError && e.status === 400 ? "邮箱格式不对。" : COPY.error),
  })

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        {added ? (
          <div className="flex flex-col gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>加好了</AlertDialogTitle>
              <AlertDialogDescription>后台不发邮件。把下面这段发给对方：</AlertDialogDescription>
            </AlertDialogHeader>
            <p className="rounded-lg border bg-muted/40 p-3 text-sm">{inviteText(added)}</p>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteText(added)).then(() => toast.success("已复制"))
                }}
              >
                <CopyIcon /> 复制
              </Button>
              <Button onClick={onClose}>完成</Button>
            </AlertDialogFooter>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (valid) add.mutate()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>添加成员</AlertDialogTitle>
              <AlertDialogDescription>对方要有这个邮箱的 Google 账号（Gmail 或用 Google 登录的工作邮箱）。</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-person-email">邮箱</Label>
              <Input
                id="new-person-email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
                placeholder="name@gmail.com"
                aria-invalid={Boolean(error)}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>角色</Label>
              <Segmented label="角色" value={role} onChange={setRole} options={roleOptions} className="self-start" />
              <p className="text-xs text-muted-foreground">{ROLE_HINT[role]}</p>
            </div>
            {myOrg === "novawerk" && (
              <div className="flex flex-col gap-1.5">
                <Label>机构</Label>
                <Segmented
                  label="机构"
                  value={org}
                  onChange={setOrg}
                  options={(Object.keys(ORG_LABEL) as Org[]).map((o) => ({ value: o, label: ORG_LABEL[o] }))}
                  className="self-start"
                />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button">取消</AlertDialogCancel>
              <Button type="submit" disabled={!valid || add.isPending}>
                添加
              </Button>
            </AlertDialogFooter>
          </form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
