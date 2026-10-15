import { PlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { CaseForm, Form, Pair } from "@/lib/content"
import { DIFFICULTY_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"

export type FieldErrors = Record<string, { zh?: string; en?: string; field?: string }>

const EN_MISSING = "英文缺失，App 英文界面会显示中文。"

/** Section 「卡片信息」: one row per field, Chinese on the left, English on the right. */
export function CardFields({
  kind,
  form,
  onChange,
  errors,
  readOnly,
}: {
  kind: "case" | "rubric"
  form: Form
  onChange: (form: Form) => void
  errors: FieldErrors
  readOnly: boolean
}) {
  const set = <K extends keyof CaseForm>(key: K, value: CaseForm[K]) => onChange({ ...form, [key]: value } as Form)
  const f = form as CaseForm

  return (
    <section className="flex flex-col gap-1 rounded-xl border px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">卡片信息</h2>
        <span className="text-xs text-muted-foreground">英文可以空着，App 英文界面会显示中文</span>
      </div>
      {kind === "case" && (
        <p className="mb-2 text-sm text-muted-foreground">
          这些都是学员开始会谈前就能看到的内容。不要写核心信念和「不会轻易透露」的内容。
        </p>
      )}
      <div className="grid grid-cols-[132px_minmax(0,1fr)_minmax(0,1fr)] gap-3 pt-2 text-xs text-muted-foreground">
        <span />
        <span>中文</span>
        <span>English</span>
      </div>
      <PairRow label="标题" fieldKey="title" value={form.title} onChange={(v) => set("title", v)} errors={errors.title} readOnly={readOnly} />
      {kind === "case" && (
        <>
          <PairRow label="简介" fieldKey="summary" value={f.summary} onChange={(v) => set("summary", v)} multiline errors={errors.summary} readOnly={readOnly} />
          <PairRow label="化名" fieldKey="clientAlias" hint="像真人的常见称呼，不写全名" value={f.clientAlias} onChange={(v) => set("clientAlias", v)} errors={errors.clientAlias} readOnly={readOnly} />
          <ListRow label="主题标签" fieldKey="tags" hint="最多 3 个" items={f.tags} max={3} onChange={(v) => set("tags", v)} errors={errors.tags} readOnly={readOnly} />
          <Row label="难度 · 预计时长（分钟）" fieldKey="difficulty · estimatedMinutes">
            <div className="flex gap-2">
              <select
                id="field-difficulty-zh"
                aria-label="难度"
                className="h-9 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm disabled:opacity-100"
                value={f.difficulty}
                disabled={readOnly}
                onChange={(e) => set("difficulty", e.target.value as CaseForm["difficulty"])}
              >
                <option value="">不填</option>
                {Object.entries(DIFFICULTY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <Input
                aria-label="预计时长（分钟）"
                type="number"
                min={1}
                max={180}
                className="w-24"
                value={f.estimatedMinutes}
                readOnly={readOnly}
                onChange={(e) => set("estimatedMinutes", e.target.value)}
              />
            </div>
            <span className="pt-2 text-sm text-muted-foreground">中英共用</span>
          </Row>
          <PairRow label="来访者" fieldKey="clientIntro" value={f.clientIntro} onChange={(v) => set("clientIntro", v)} multiline errors={errors.clientIntro} readOnly={readOnly} />
          <ListRow label="这次练什么" fieldKey="practiceFocus" hint="前两条固定「风险筛查」「判断能不能承接」" items={f.practiceFocus} max={3} onChange={(v) => set("practiceFocus", v)} errors={errors.practiceFocus} readOnly={readOnly} numbered />
          <PairRow label="内容提示" fieldKey="contentNotes" hint="空着用通用提示" value={f.contentNotes} onChange={(v) => set("contentNotes", v)} multiline errors={errors.contentNotes} readOnly={readOnly} />
        </>
      )}
    </section>
  )
}

function Row({ label, fieldKey, children }: { label: string; fieldKey: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 border-t py-2.5">
      <div className="flex flex-col gap-0.5 pt-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{fieldKey}</span>
      </div>
      {children}
    </div>
  )
}

function Note({ children, error }: { children?: React.ReactNode; error?: boolean }) {
  if (!children) return null
  return <span className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>{children}</span>
}

function PairRow({
  label,
  fieldKey,
  hint,
  value,
  onChange,
  multiline,
  errors,
  readOnly,
}: {
  label: string
  fieldKey: string
  hint?: string
  value: Pair
  onChange: (v: Pair) => void
  multiline?: boolean
  errors?: FieldErrors[string]
  readOnly: boolean
}) {
  const Control = multiline ? Textarea : Input
  const zhError = errors?.zh ?? errors?.field
  return (
    <Row label={label} fieldKey={fieldKey}>
      <div className="flex flex-col gap-1">
        <Control
          id={`field-${fieldKey}-zh`}
          aria-label={`${label}（中文）`}
          value={value.zh}
          readOnly={readOnly}
          aria-invalid={Boolean(zhError)}
          className={multiline ? "min-h-16" : undefined}
          onChange={(e) => onChange({ ...value, zh: e.target.value })}
        />
        <Note error>{zhError}</Note>
        <Note>{hint}</Note>
      </div>
      <div className="flex flex-col gap-1">
        <Control
          id={`field-${fieldKey}-en`}
          aria-label={`${label}（English）`}
          value={value.en}
          readOnly={readOnly}
          aria-invalid={Boolean(errors?.en)}
          className={cn(multiline && "min-h-16", !value.en && "bg-muted/50")}
          onChange={(e) => onChange({ ...value, en: e.target.value })}
        />
        <Note error>{errors?.en}</Note>
        {!errors?.en && value.zh.trim() && !value.en.trim() && <Note>{EN_MISSING}</Note>}
      </div>
    </Row>
  )
}

function ListRow({
  label,
  fieldKey,
  hint,
  items,
  max,
  onChange,
  errors,
  readOnly,
  numbered,
}: {
  label: string
  fieldKey: string
  hint: string
  items: Pair[]
  max: number
  onChange: (v: Pair[]) => void
  errors?: FieldErrors[string]
  readOnly: boolean
  numbered?: boolean
}) {
  const update = (i: number, p: Pair) => onChange(items.map((x, j) => (j === i ? p : x)))
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i))
  const error = errors?.field ?? errors?.zh
  return (
    <Row label={label} fieldKey={fieldKey}>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            {numbered && <span className="w-4 text-sm text-muted-foreground tabular-nums">{i + 1}.</span>}
            <Input
              id={i === 0 ? `field-${fieldKey}-zh` : undefined}
              aria-label={`${label} ${i + 1}（中文）`}
              value={item.zh}
              readOnly={readOnly}
              aria-invalid={Boolean(error)}
              onChange={(e) => update(i, { ...item, zh: e.target.value })}
            />
          </div>
        ))}
        {!readOnly && items.length < max && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange([...items, { zh: "", en: "" }])}>
            <PlusIcon /> 添加
          </Button>
        )}
        <Note error>{error}</Note>
        <Note>{hint}</Note>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input
              aria-label={`${label} ${i + 1}（English）`}
              value={item.en}
              readOnly={readOnly}
              className={cn(!item.en && "bg-muted/50")}
              onChange={(e) => update(i, { ...item, en: e.target.value })}
            />
            {!readOnly && (
              <Button variant="ghost" size="icon-sm" aria-label={`删除${label} ${i + 1}`} onClick={() => remove(i)}>
                <XIcon />
              </Button>
            )}
          </div>
        ))}
        {items.some((x) => x.zh.trim() && !x.en.trim()) && <Note>{EN_MISSING}</Note>}
      </div>
    </Row>
  )
}
