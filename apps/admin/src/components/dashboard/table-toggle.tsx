import * as React from "react"

import { HIDDEN_HINT, formatCount } from "@/lib/labels"
import type { Count } from "@/lib/types"

export type Column = { label: string; values: (Count | null)[] }

/** 「显示表格」: the same numbers as the chart, one row per period. "<5" written as <5. */
export function TableToggle({
  periods,
  columns,
  formatPeriod,
  periodLabel,
  defaultOpen = false,
}: {
  periods: string[]
  columns: Column[]
  formatPeriod: (p: string) => string
  periodLabel: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div className="flex flex-col gap-2 border-t pt-2.5">
      <button
        type="button"
        className="self-start text-sm font-medium"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "收起表格 ▴" : "显示表格 ▾"}
      </button>
      {open && (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-background text-muted-foreground">
              <tr>
                <th className="border-b px-2 py-1.5 text-left font-medium">{periodLabel}</th>
                {columns.map((c) => (
                  <th key={c.label} className="border-b px-2 py-1.5 text-right font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods
                .map((p, i) => ({ p, i }))
                .reverse()
                .map(({ p, i }) => (
                  <tr key={p}>
                    <td className="border-b px-2 py-1.5">{formatPeriod(p)}</td>
                    {columns.map((c) => {
                      const v = c.values[i]
                      return (
                        <td
                          key={c.label}
                          className={`border-b px-2 py-1.5 text-right ${v === "<5" || v === null ? "text-muted-foreground" : ""}`}
                          title={v === "<5" ? HIDDEN_HINT : undefined}
                        >
                          {formatCount(v)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
