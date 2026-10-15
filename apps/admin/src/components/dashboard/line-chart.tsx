import * as React from "react"

import { HIDDEN_HINT, formatCount } from "@/lib/labels"
import type { Count } from "@/lib/types"

export type LineSeries = {
  label: string
  /** A CSS color, usually var(--series-n). */
  color: string
  dashed?: boolean
  /** One per period; null = no value for this period (e.g. a weekly count on a weekday). */
  values: (Count | null)[]
}

const H = 240
const PAD = { top: 12, right: 24, bottom: 26, left: 36 }

function niceMax(n: number) {
  if (n <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(n))
  return Math.ceil(n / step) * step
}

/**
 * A line per series. A "<5" point breaks the line and shows as a hollow circle on the baseline,
 * with the hover hint 「少于 5，不显示具体数字」. Never drawn as 0.
 */
export function LineChart({
  periods,
  series,
  formatPeriod,
  label,
  height = H,
}: {
  periods: string[]
  series: LineSeries[]
  formatPeriod: (p: string) => string
  label: string
  height?: number
}) {
  const [hover, setHover] = React.useState<number | null>(null)
  // Draw at the real pixel width so text and strokes don't stretch.
  const ref = React.useRef<HTMLDivElement>(null)
  const [W, setW] = React.useState(940)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values.map((v) => (typeof v === "number" ? v : 0)))))
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (periods.length <= 1 ? innerW / 2 : (i * innerW) / (periods.length - 1))
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const baseline = y(0)
  const ticks = [0, max / 2, max]
  const labelEvery = Math.max(1, Math.ceil(periods.length / 6))

  const segments = series.flatMap((s) => {
    const out: { color: string; dashed?: boolean; points: string }[] = []
    let cur: string[] = []
    const flush = () => {
      if (cur.length > 1) out.push({ color: s.color, dashed: s.dashed, points: cur.join(" ") })
      cur = []
    }
    s.values.forEach((v, i) => {
      if (typeof v === "number") cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      else if (v === "<5") flush()
    })
    flush()
    return out
  })

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD.left) / innerW) * (periods.length - 1))
    setHover(i >= 0 && i < periods.length ? i : null)
  }

  return (
    <div ref={ref} className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={label}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-muted" strokeWidth={1} />
            <text x={0} y={y(t) + 4} fontSize={11} className="fill-muted-foreground">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={baseline} className="stroke-border" strokeWidth={1} />
        )}
        {segments.map((s, i) => (
          <polyline
            key={i}
            points={s.points}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((s) =>
          s.values.map((v, i) =>
            v === "<5" ? (
              <circle key={`${s.label}-${i}`} cx={x(i)} cy={baseline - 4} r={3} className="fill-background" stroke={s.color} strokeWidth={1.5}>
                <title>{HIDDEN_HINT}</title>
              </circle>
            ) : null,
          ),
        )}
        {periods.map((p, i) =>
          i % labelEvery === 0 || i === periods.length - 1 ? (
            <text key={p} x={x(i)} y={height - 6} fontSize={11} textAnchor="middle" className="fill-muted-foreground">
              {formatPeriod(p)}
            </text>
          ) : null,
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-md border bg-popover px-3 py-2 text-xs shadow-sm"
          style={{ left: `min(calc(${(x(hover) / W) * 100}% + 12px), calc(100% - 13rem))` }}
        >
          <div className="mb-1 font-medium">{formatPeriod(periods[hover])}</div>
          {series.map((s) => {
            const v = s.values[hover]
            if (v === null) return null
            return (
              <div key={s.label} className="flex items-center gap-2">
                <span className="h-0 w-3 border-t-2" style={{ borderColor: s.color, borderStyle: s.dashed ? "dashed" : "solid" }} />
                <span className="flex-1 text-muted-foreground">{s.label}</span>
                <span className="tabular-nums">{v === "<5" ? HIDDEN_HINT : formatCount(v)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Legend({ series }: { series: Pick<LineSeries, "label" | "color" | "dashed">[] }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className="h-0 w-3.5 border-t-2" style={{ borderColor: s.color, borderStyle: s.dashed ? "dashed" : "solid" }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}
