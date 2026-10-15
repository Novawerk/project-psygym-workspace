import { Textarea } from "@/components/ui/textarea"
import { outline } from "@/lib/content"
import type { Kind } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Section 「给 AI 的角色说明」: one Markdown text, with the template's outline beside it. */
export function BodyEditor({
  kind,
  value,
  onChange,
  error,
  readOnly,
}: {
  kind: Kind
  value: string
  onChange: (v: string) => void
  error?: string
  readOnly: boolean
}) {
  const heads = outline(kind, value)
  return (
    <section className="flex flex-col gap-3 rounded-xl border px-6 py-5">
      <h2 className="text-base font-semibold">给 AI 的角色说明</h2>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
        <div className="flex flex-col overflow-hidden rounded-lg border">
          <div className="flex justify-between border-b bg-sidebar px-3 py-1.5 text-xs text-muted-foreground">
            <span className="font-medium">Markdown</span>
            <span>只写中文，AI 读</span>
          </div>
          <Textarea
            id="field-body-zh"
            aria-label="给 AI 的角色说明"
            value={value}
            readOnly={readOnly}
            aria-invalid={Boolean(error)}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[420px] rounded-none border-0 font-mono text-[12.5px] leading-7 focus-visible:ring-0"
          />
          {error && <p className="border-t px-3 py-1.5 text-xs text-destructive">{error}</p>}
        </div>
        <nav aria-label="大纲" className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">大纲</span>
          {heads.map((h) => (
            <span key={h.label} className={cn("flex gap-1.5", h.present ? "text-foreground/80" : "text-muted-foreground")}>
              <span aria-hidden="true">{h.present ? "✓" : "○"}</span>
              {h.label}
            </span>
          ))}
          <span className="mt-2 text-xs text-muted-foreground">HTML 注释（例如「临时版本，待聆镜确认」）会原样保留。</span>
        </nav>
      </div>
    </section>
  )
}
