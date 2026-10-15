import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Bilingual } from "@/lib/types"

/** One field, Chinese on the left and English on the right. An empty English falls back to Chinese in the App. */
export function BilingualField({
  label,
  hint,
  value,
  multiline,
  readOnly,
  error,
}: {
  label: string
  hint?: string
  value: Bilingual
  multiline?: boolean
  readOnly?: boolean
  error?: string
}) {
  const Control = multiline ? Textarea : Input
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <Label>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Control aria-label={`${label}（中文）`} defaultValue={value.zh} readOnly={readOnly} aria-invalid={!!error} />
        <Control
          aria-label={`${label}（English）`}
          defaultValue={value.en}
          readOnly={readOnly}
          placeholder="English（空着时 App 显示中文）"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
