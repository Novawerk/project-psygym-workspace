import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"

import { Page } from "@/components/page"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/hooks/use-me"
import { ApiError } from "@/lib/api"
import { dataSource } from "@/lib/data-source"
import { COPY, canManagePeople, formatTime } from "@/lib/labels"
import { modelSettingsQueryOptions, queryKeys } from "@/lib/queries"
import type { LlmRole, ModelProviderId, ModelSettings, ModelSettingsPatch } from "@/lib/types"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/models")({
  component: ModelsPage,
})

type On = Extract<ModelSettings, { enabled: true }>

const ROLE_LABEL: Record<LlmRole, string> = { client: "AI 来访者", supervisor: "AI 督导" }
const ROLE_HINT: Record<LlmRole, string> = {
  client: "和学员对话，要回得快。语音会谈也用它。",
  supervisor: "练完写反馈报告，练习中给提示。",
}
const PROVIDER_LABEL: Record<string, string> = { anthropic: "Claude", deepseek: "DeepSeek" }
const DEEPSEEK_NOTE =
  "DeepSeek 现在不能选。App 里请用户同意的说明、隐私政策和商店的隐私标签，写的都是「对话发给美国的 Anthropic」。换成 DeepSeek，数据会去中国：要先改这些，让所有用户重新同意，还要有把数据从欧盟传到中国的法律依据。"

/** Which model each AI uses, and whose API key. Role admin only (docs/decisions/0015-model-settings.md). */
function ModelsPage() {
  const me = useMe()
  const allowed = canManagePeople(me.role)
  const { data, error } = useQuery({ ...modelSettingsQueryOptions, enabled: allowed })

  if (!allowed) {
    return (
      <Page crumbs={[{ label: "模型设置" }]} title="模型设置">
        <p className="text-sm text-muted-foreground">只有管理员能改模型设置。</p>
      </Page>
    )
  }

  return (
    <Page
      crumbs={[{ label: "模型设置" }]}
      title="模型设置"
      description="AI 来访者和 AI 督导用哪个模型、用谁的 key。保存前会用这个 key 真调一次模型，不通就不保存。保存后一分钟内生效，不用重新部署。"
    >
      {error && <p className="text-sm text-muted-foreground">{COPY.error}</p>}
      {!data && !error && <Skeleton className="h-64" />}
      {data && !data.enabled && (
        <Section title="还没开">
          <p className="text-sm text-muted-foreground">
            服务器上没有设 <code>MODEL_SETTINGS_SECRET</code>，所以这里只能看、不能改。现在用的是服务器环境变量里的模型和 key。请找部署的人设上这个变量（见 docs/deploy.md）。
          </p>
        </Section>
      )}
      {data?.enabled && <Settings s={data} />}
    </Page>
  )
}

function Section({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex max-w-4xl flex-col gap-3 pb-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function useSave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: ModelSettingsPatch) => dataSource.saveModelSettings(patch),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.modelSettings, next)
      toast.success("已保存，一分钟内生效")
    },
  })
}

const errorText = (e: unknown) =>
  e instanceof ApiError && (e.status === 422 || e.status === 400)
    ? e.message
    : e instanceof ApiError && e.status === 429
      ? "试得太频繁了，请过一会儿再试。"
      : COPY.error

function Settings({ s }: { s: On }) {
  const deepseek = s.providers.find((p) => p.id === "deepseek")
  return (
    <>
      <Section title="API key" description="key 只存在服务器上，加密保存。存好以后这里只显示最后 4 位，谁也看不到完整的 key。">
        <div className="flex flex-col gap-3">
          {s.providers.map((p) => (
            <KeyRow key={p.id} s={s} provider={p.id} allowed={p.allowed} />
          ))}
        </div>
      </Section>

      <Section title="模型" description="没在这里设的，用服务器的默认设置。">
        <div className="grid gap-3 lg:grid-cols-2">
          {(["client", "supervisor"] as const).map((role) => (
            <RoleCard key={role} s={s} role={role} />
          ))}
        </div>
        {deepseek && !deepseek.allowed && <p className="max-w-3xl text-xs text-muted-foreground">{DEEPSEEK_NOTE}</p>}
      </Section>

      <Section title="修改记录">
        {s.log.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有人改过。</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border text-sm">
            {s.log.map((l, i) => (
              <li key={i} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
                <span className="whitespace-nowrap text-muted-foreground">{formatTime(l.at)}</span>
                <span className="text-muted-foreground">{l.by ?? "（已删除的成员）"}</span>
                <span>{l.change}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}

function KeyRow({ s, provider, allowed }: { s: On; provider: ModelProviderId; allowed: boolean }) {
  const save = useSave()
  const [value, setValue] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const k = s.keys[provider]
  const status = k.from === "admin" ? `后台填的 …${k.hint}` : k.from === "env" ? `服务器默认 …${k.hint}` : "还没有"
  const id = `key-${provider}`

  const submit = (key: string | null) =>
    save.mutate(
      { keys: { [provider]: key } },
      {
        onSuccess: () => {
          setValue("")
          setError(null)
        },
        onError: (e) => setError(errorText(e)),
      },
    )

  return (
    <form
      className={cn("flex flex-col gap-2 rounded-xl border p-4", !allowed && "opacity-60")}
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) submit(value.trim())
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {PROVIDER_LABEL[provider]} key
        </Label>
        <span className={cn("rounded px-2 py-0.5 text-xs", k.from ? "bg-muted" : "bg-warning-bg text-warning-fg")}>{status}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="min-w-64 flex-1 font-mono"
          placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-…"}
          value={value}
          disabled={!allowed || save.isPending}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          aria-invalid={Boolean(error)}
        />
        <Button type="submit" disabled={!allowed || !value.trim() || save.isPending}>
          {save.isPending ? "正在试这个 key…" : k.from ? "换成这个 key" : "保存"}
        </Button>
        {k.from === "admin" && (
          <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => submit(null)}>
            删掉，用服务器默认
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!allowed && <p className="text-xs text-muted-foreground">现在不能用，原因见下面「模型」一节。</p>}
    </form>
  )
}

function RoleCard({ s, role }: { s: On; role: LlmRole }) {
  const save = useSave()
  const r = s.roles[role]
  const current = (r.provider === "deepseek" ? "deepseek" : "anthropic") as ModelProviderId
  const [provider, setProvider] = React.useState<ModelProviderId>(current)
  const [model, setModel] = React.useState(r.from === "admin" ? (r.model ?? "") : "")
  const [error, setError] = React.useState<string | null>(null)
  const options = s.providers.filter((p) => p.allowed).map((p) => ({ value: p.id, label: PROVIDER_LABEL[p.id]! }))
  const defaultModel = s.providers.find((p) => p.id === provider)?.defaultModel ?? ""
  const id = `model-${role}`

  const submit = (patch: ModelSettingsPatch) =>
    save.mutate(patch, {
      onSuccess: (next) => {
        setError(null)
        if (next.enabled) setModel(next.roles[role].from === "admin" ? (next.roles[role].model ?? "") : "")
      },
      onError: (e) => setError(errorText(e)),
    })

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit({ [role]: { provider, model: model.trim() } })
      }}
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">{ROLE_LABEL[role]}</h3>
        <p className="text-xs text-muted-foreground">{ROLE_HINT[role]}</p>
      </div>
      <p className="text-sm">
        现在用：
        <span className="font-medium">
          {r.provider ? PROVIDER_LABEL[r.provider] ?? r.provider : "—"} · <span className="font-mono">{r.model ?? "—"}</span>
        </span>
        <span className="ml-2 text-xs text-muted-foreground">{r.from === "admin" ? "后台设置" : "服务器默认"}</span>
        {!r.available && <span className="ml-2 rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">用不了：{r.reason}</span>}
      </p>
      {options.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label>模型服务</Label>
          <Segmented label={`${ROLE_LABEL[role]}的模型服务`} value={provider} onChange={setProvider} options={options} className="self-start" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>模型名</Label>
        <Input
          id={id}
          className="font-mono"
          spellCheck={false}
          placeholder={`空着就用 ${defaultModel}`}
          value={model}
          disabled={save.isPending}
          onChange={(e) => {
            setModel(e.target.value)
            setError(null)
          }}
          aria-invalid={Boolean(error)}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "正在试这个模型…" : "保存"}
        </Button>
        {r.from === "admin" && (
          <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => submit({ [role]: null })}>
            改回默认
          </Button>
        )}
      </div>
    </form>
  )
}
