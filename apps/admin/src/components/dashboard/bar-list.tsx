import { HIDDEN_HINT, formatCount } from "@/lib/labels"
import type { Count } from "@/lib/types"
import { cn } from "@/lib/utils"

export type Bar = { label: string; hint?: string; mono?: boolean; value: Count }

/** Horizontal bars. A "<5" bar is a short grey stub with the value written as <5. */
export function BarList({ bars, thick }: { bars: Bar[]; thick?: boolean }) {
  const max = Math.max(1, ...bars.map((b) => (typeof b.value === "number" ? b.value : 0)))
  return (
    <div className="flex flex-col gap-2.5">
      {bars.map((b) => {
        const hidden = b.value === "<5"
        const width = hidden ? 4 : Math.max(b.value === 0 ? 0 : 3, Math.round(((b.value as number) / max) * 100))
        return (
          <div key={b.label} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-2 text-xs">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-foreground/80">
                <span className={cn(b.mono && "font-mono")}>{b.label}</span>
                {b.hint && <span className="text-muted-foreground"> {b.hint}</span>}
              </span>
              <div className={cn("rounded-sm bg-muted", thick ? "h-3.5" : "h-2")}>
                <div
                  className={cn("rounded-sm", thick ? "h-3.5" : "h-2", hidden ? "bg-border" : "bg-series-2")}
                  style={{ width: `${width}%` }}
                  title={hidden ? HIDDEN_HINT : undefined}
                />
              </div>
            </div>
            <span
              className={cn("text-right tabular-nums", hidden ? "text-muted-foreground" : "text-foreground")}
              title={hidden ? HIDDEN_HINT : undefined}
            >
              {formatCount(b.value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
