import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { FilterSelect } from "@/components/filter-select"
import { Page, PendingContract } from "@/components/page"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCount, formatPercent } from "@/lib/labels"
import { casesQueryOptions, statsQueryOptions } from "@/lib/queries"
import type { MaskedCount, StatsFilter } from "@/lib/types"

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
})

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

function defaultRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 29 * 86_400_000)
  return { from: isoDay(from), to: isoDay(to) }
}

function DashboardPage() {
  const [range, setRange] = React.useState(defaultRange)
  const [interval, setInterval] = React.useState<StatsFilter["interval"]>("day")
  const [caseId, setCaseId] = React.useState("all")
  const [locale, setLocale] = React.useState<"all" | "zh" | "en">("all")

  const filter: StatsFilter = {
    ...range,
    interval,
    caseId: caseId === "all" ? undefined : caseId,
    locale: locale === "all" ? undefined : locale,
  }
  const { data: stats } = useQuery(statsQueryOptions(filter))
  const { data: cases } = useQuery(casesQueryOptions)

  return (
    <Page
      title="数据看板"
      description="只有按天的匿名计数。小于 5 的格子显示「<5」。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            aria-label="开始日期"
            className="h-8 w-36"
            value={range.from}
            max={range.to}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="结束日期"
            className="h-8 w-36"
            value={range.to}
            min={range.from}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
          <FilterSelect
            label="粒度"
            value={interval}
            onChange={setInterval}
            options={[
              { value: "day", label: "按天" },
              { value: "week", label: "按周" },
            ]}
          />
          <FilterSelect
            label="病例"
            value={caseId}
            onChange={setCaseId}
            options={[
              { value: "all", label: "全部病例" },
              ...(cases ?? []).map((c) => ({ value: c.id, label: c.title.zh })),
            ]}
          />
          <FilterSelect
            label="语言"
            value={locale}
            onChange={setLocale}
            options={[
              { value: "all", label: "全部语言" },
              { value: "zh", label: "中文" },
              { value: "en", label: "English" },
            ]}
          />
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="开始会谈" value={stats && formatCount(stats.summary.started)} />
        <StatCard label="完成（生成报告）" value={stats && formatCount(stats.summary.completed)} />
        <StatCard label="完成率" value={stats && formatPercent(stats.summary.completionRate)} />
        <StatCard label="实时督导" value={stats && formatCount(stats.summary.liveSupervision)} />
        <StatCard label="👍 比例" value={stats && formatPercent(stats.summary.thumbsUpRate)} />
        <StatCard label="日活" value={stats && activeValue(stats.summary.dailyActive)} />
        <StatCard label="周活" value={stats && activeValue(stats.summary.weeklyActive)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>开始和完成</CardTitle>
          <CardDescription>折线图和下面的表是同一份数。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PendingContract>折线图：等后端的接口合同定了再画。</PendingContract>
          <div className="max-h-80 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead className="text-right">开始</TableHead>
                  <TableHead className="text-right">完成</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats?.series
                  .slice()
                  .reverse()
                  .map((p) => (
                    <TableRow key={p.day}>
                      <TableCell className="font-mono text-xs">{p.day}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(p.started)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(p.completed)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {["举报（按原因）", "出错（按代码）", "时长分档", "轮数分档"].map((title) => (
          <Card key={title} size="sm">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <PendingContract>柱状图：等接口合同。</PendingContract>
            </CardContent>
          </Card>
        ))}
      </div>
    </Page>
  )
}

/** Active counts come from rotating pseudonyms and don't split by case or locale. */
function activeValue(n: MaskedCount | null) {
  return n === null ? <span className="text-sm font-normal text-muted-foreground">筛选时不可用</span> : formatCount(n)
}

function StatCard({ label, value }: { label: string; value: React.ReactNode | undefined }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">
          {value === undefined ? <Skeleton className="h-8 w-16" /> : value}
        </span>
      </CardContent>
    </Card>
  )
}
