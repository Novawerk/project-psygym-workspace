import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { BarList, type Bar } from "@/components/dashboard/bar-list"
import { Legend, LineChart, type LineSeries } from "@/components/dashboard/line-chart"
import { TableToggle } from "@/components/dashboard/table-toggle"
import { Page } from "@/components/page"
import { Segmented } from "@/components/segmented"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import {
  dailyAverage,
  findSeries,
  formatPeriod,
  isSunday,
  lastDays,
  latestWeek,
  ratio,
  totalOf,
  valuesOf,
} from "@/lib/dashboard"
import {
  COPY,
  DURATION_BUCKETS,
  ERROR_CODE_HINT,
  REPORT_REASON_HINT,
  TURN_BUCKETS,
  formatCount,
  formatDuration,
  formatPercent,
} from "@/lib/labels"
import { dashboardQueryOptions } from "@/lib/queries"
import type { Dashboard, DashboardQuery, Granularity } from "@/lib/types"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
})

type RangeKey = "7" | "30" | "90" | "custom"

const SESSION_SERIES = [
  { metric: "session_started", label: "开始", color: "var(--series-1)" },
  { metric: "session_ended_by_client", label: "来访者主动结束", color: "var(--series-3)" },
  { metric: "report_generated", label: "完成", color: "var(--series-2)" },
  { metric: "report_failed", label: "报告失败", color: "var(--series-5)", dashed: true },
  { metric: "live_supervision", label: "实时督导", color: "var(--series-4)" },
]

function DashboardPage() {
  const [rangeKey, setRangeKey] = React.useState<RangeKey>("30")
  const [custom, setCustom] = React.useState(() => lastDays(30))
  const [granularity, setGranularity] = React.useState<Granularity>("day")
  const [caseId, setCaseId] = React.useState("all")
  const [locale, setLocale] = React.useState<"all" | "zh" | "en">("all")

  const range = rangeKey === "custom" ? custom : lastDays(Number(rangeKey))
  const q: DashboardQuery = {
    ...range,
    granularity,
    caseId: caseId === "all" ? undefined : caseId,
    locale: locale === "all" ? undefined : locale,
  }
  const { data: d, error } = useQuery(dashboardQueryOptions(q))

  const caseOptions = [{ value: "all", label: "全部病例" }, ...(d?.cases ?? []).map((c) => ({ value: c.id, label: c.title.zh || c.id }))]
  const localeOptions = [
    { value: "all", label: "全部语言" },
    { value: "zh", label: "中文" },
    { value: "en", label: "英文" },
  ]

  return (
    <Page
      crumbs={[{ label: "数据看板" }]}
      title="数据看板"
      actions={
        <>
          <Segmented
            label="日期范围"
            value={rangeKey}
            onChange={setRangeKey}
            options={[
              { value: "7", label: "最近 7 天" },
              { value: "30", label: "最近 30 天" },
              { value: "90", label: "最近 90 天" },
              { value: "custom", label: "自定义" },
            ]}
          />
          {rangeKey === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" aria-label="开始日期" className="h-8 w-36" value={custom.from} max={custom.to}
                onChange={(e) => e.target.value && setCustom((r) => ({ ...r, from: e.target.value }))} />
              <span className="text-muted-foreground">–</span>
              <Input type="date" aria-label="结束日期" className="h-8 w-36" value={custom.to} min={custom.from}
                onChange={(e) => e.target.value && setCustom((r) => ({ ...r, to: e.target.value }))} />
            </div>
          )}
          <Segmented
            label="粒度"
            value={granularity}
            onChange={setGranularity}
            options={[
              { value: "day", label: "按天" },
              { value: "week", label: "按周" },
            ]}
          />
          <Select items={caseOptions} value={caseId} onValueChange={(v) => setCaseId(v as string)}>
            <SelectTrigger size="sm" aria-label="病例" className="max-w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {caseOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select items={localeOptions} value={locale} onValueChange={(v) => setLocale(v as typeof locale)}>
            <SelectTrigger size="sm" aria-label="语言">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {localeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
    >
      {error ? (
        <Notice>{error instanceof ApiError && error.status === 404 ? "统计没有开启。" : COPY.error}</Notice>
      ) : !d ? (
        <DashboardSkeleton />
      ) : d.series.length === 0 && !d.active ? (
        <Notice>这段时间没有数据。</Notice>
      ) : (
        <DashboardBody d={d} rangeLabel={rangeKey === "custom" ? `${d.from} – ${d.to}` : `最近 ${rangeKey} 天`} />
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        为保护隐私，少于 5 的数字显示为 &lt;5；同一行或同一列只遮一个数时，会多遮一个。日活周活是按天、按周轮换的假名统计。日期按 UTC。
      </p>
    </Page>
  )
}

function DashboardBody({ d, rangeLabel }: { d: Dashboard; rangeLabel: string }) {
  const fp = (p: string) => formatPeriod(p, d.granularity)
  const periodLabel = d.granularity === "week" ? "周（周一）" : "日期"
  const started = totalOf(findSeries(d, "session_started"))
  const completed = totalOf(findSeries(d, "report_generated"))
  const up = totalOf(findSeries(d, "feedback", "up"))
  const down = totalOf(findSeries(d, "feedback", "down"))
  const feedbackHidden = up === "<5" || down === "<5"
  const upRatio = feedbackHidden ? null : ratio(up, (up as number) + (down as number))
  const filtered = !d.active

  const sessionSeries: LineSeries[] = SESSION_SERIES.map((s) => ({ ...s, values: valuesOf(d, findSeries(d, s.metric)) }))

  const activeSeries: LineSeries[] = d.active
    ? [
        { label: "日活", color: "var(--series-1)", values: valuesOf(d, d.active.day) },
        {
          label: "周活",
          color: "var(--series-3)",
          // By day, a week's count sits on its Sunday; the other days have no weekly value.
          values: valuesOf(d, d.active.week).map((v, i) => (d.granularity === "day" && !isSunday(d.periods[i]) ? null : v)),
        },
      ]
    : []

  const dimSeries = (metric: string) => d.series.filter((s) => s.metric === metric && s.dim !== "")
  const feedbackBars: Bar[] = [
    { label: "👍", value: up },
    { label: "👎", value: down },
    ...dimSeries("user_report").map((s) => ({ label: `举报 · ${s.dim}`, hint: REPORT_REASON_HINT[s.dim], value: s.total })),
  ]
  const errorBars: Bar[] = dimSeries("error").map((s) => ({ label: s.dim, mono: true, hint: ERROR_CODE_HINT[s.dim], value: s.total }))
  const durationBars: Bar[] = DURATION_BUCKETS.map(([dim, label]) => ({ label, value: totalOf(findSeries(d, "session_duration", dim)) }))
  const turnBars: Bar[] = TURN_BUCKETS.map(([dim, label]) => ({ label, value: totalOf(findSeries(d, "report_generated", dim)) }))
  const avg = d.duration.total.sessions === "<5" ? null : d.duration.total.avgSec

  const dimColumns = (metric: string, dims: readonly (readonly [string, string])[]) =>
    dims.map(([dim, label]) => ({ label, values: valuesOf(d, findSeries(d, metric, dim)) }))

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="开始的会谈" value={formatCount(started)} sub={rangeLabel} />
        <Kpi label="完成的会谈" value={formatCount(completed)} sub="生成了完整报告" />
        <Kpi label="完成率" value={formatPercent(ratio(completed, started))} sub="完成 ÷ 开始" />
        <Kpi label="实时督导" value={formatCount(totalOf(findSeries(d, "live_supervision")))} sub="打开督导提示的次数" />
        <Kpi label="👍 比例" value={formatPercent(upRatio)} sub={feedbackHidden ? "有一边是 <5" : "👍 ÷（👍 + 👎）"} />
        {filtered ? (
          <Kpi label="日活 / 周活" value="筛选时不可用" sub="只按全部算" muted />
        ) : (
          <Kpi
            label="日活 / 周活"
            value={`${formatCount(dailyAverage(d.active!.day))} / ${formatCount(latestWeek(d.active!.week, d.granularity))}`}
            sub="日均 · 最近一周"
          />
        )}
      </div>

      <Section title="会谈" right={<Legend series={sessionSeries} />}>
        <LineChart periods={d.periods} series={sessionSeries} formatPeriod={fp} label="会谈折线图" />
        <p className="text-xs text-muted-foreground">空心圆：这一段少于 5，显示为 &lt;5，线在这里断开。</p>
        <TableToggle
          periods={d.periods}
          formatPeriod={fp}
          periodLabel={periodLabel}
          columns={sessionSeries.map((s) => ({ label: s.label, values: s.values }))}
        />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="活跃人数" right={!filtered && <Legend series={activeSeries} />}>
          {filtered ? (
            <div className="flex min-h-44 flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground">
              <span className="font-semibold text-foreground/80">筛选时不可用</span>
              <span className="text-xs">活跃人数只按全部算，不按病例和语言分。</span>
            </div>
          ) : (
            <>
              <LineChart periods={d.periods} series={activeSeries} formatPeriod={fp} label="活跃人数折线图" height={180} />
              <TableToggle periods={d.periods} formatPeriod={fp} periodLabel={periodLabel}
                columns={activeSeries.map((s) => ({ label: s.label, values: s.values }))} />
            </>
          )}
        </Section>
        <Section title="评价和举报">
          <BarList bars={feedbackBars} thick />
          <TableToggle periods={d.periods} formatPeriod={fp} periodLabel={periodLabel}
            columns={[
              { label: "👍", values: valuesOf(d, findSeries(d, "feedback", "up")) },
              { label: "👎", values: valuesOf(d, findSeries(d, "feedback", "down")) },
              ...dimSeries("user_report").map((s) => ({ label: `举报 · ${s.dim}`, values: valuesOf(d, s) })),
            ]} />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="出错" note="按错误码">
          {errorBars.length ? <BarList bars={errorBars} /> : <p className="text-sm text-muted-foreground">没有出错。</p>}
          <TableToggle periods={d.periods} formatPeriod={fp} periodLabel={periodLabel}
            columns={dimSeries("error").map((s) => ({ label: s.dim, values: valuesOf(d, s) }))} />
        </Section>
        <Section title="时长分布" note={`平均 ${formatDuration(avg)}`}>
          <BarList bars={durationBars} />
          <TableToggle periods={d.periods} formatPeriod={fp} periodLabel={periodLabel} columns={dimColumns("session_duration", DURATION_BUCKETS)} />
        </Section>
        <Section title="轮数分布" note="每场的对话轮数">
          <BarList bars={turnBars} />
          <TableToggle periods={d.periods} formatPeriod={fp} periodLabel={periodLabel} columns={dimColumns("report_generated", TURN_BUCKETS)} />
        </Section>
      </div>
    </>
  )
}

function Kpi({ label, value, sub, muted }: { label: string; value: string; sub: string; muted?: boolean }) {
  const long = value.length > 7
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border px-4 py-3.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("font-bold tabular-nums", long ? "text-[15px] leading-8" : "text-[26px] leading-8", muted && "text-muted-foreground")}>
        {value}
      </span>
      <span className="truncate text-xs text-muted-foreground">{sub}</span>
    </div>
  )
}

function Section({ title, note, right, children }: { title: string; note?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
        {right}
      </div>
      {children}
    </section>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">{children}</div>
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <span className="sr-only">{COPY.loading}</span>
    </>
  )
}

