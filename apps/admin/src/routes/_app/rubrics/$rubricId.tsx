import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ChevronLeftIcon, SaveIcon } from "lucide-react"
import { toast } from "sonner"

import { BilingualField } from "@/components/content/bilingual-field"
import { PublishButton } from "@/components/content/publish-button"
import { VersionHistory } from "@/components/content/version-history"
import { Page } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useMe } from "@/hooks/use-me"
import { canEdit } from "@/lib/labels"
import { rubricQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/_app/rubrics/$rubricId")({
  component: RubricEditPage,
})

function RubricEditPage() {
  const { rubricId } = Route.useParams()
  const me = useMe()
  const editable = canEdit(me.role)
  const { data: r } = useQuery(rubricQueryOptions(rubricId))

  if (!r) {
    return (
      <Page title={<Skeleton className="h-7 w-48" />}>
        <Skeleton className="h-64 w-full" />
      </Page>
    )
  }

  return (
    <Page
      title={
        <span className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link to="/rubrics" />} aria-label="回到督导标准列表">
            <ChevronLeftIcon />
          </Button>
          {r.title.zh}
          {r.publishedVersion && <Badge variant="secondary">已发布 v{r.publishedVersion}</Badge>}
        </span>
      }
      description={<span className="font-mono text-xs">{r.id}</span>}
      actions={
        <>
          <VersionHistory versions={r.versions} current={r.publishedVersion} canRestore={editable} />
          {editable && (
            <>
              <Button variant="outline" size="sm" onClick={() => toast("保存草稿：等接口合同。")}>
                <SaveIcon /> 保存草稿
              </Button>
              <PublishButton what={r.title.zh} nextVersion={(r.publishedVersion ?? 0) + 1} />
            </>
          )}
        </>
      }
    >
      <Card>
        <CardContent className="flex flex-col gap-5">
          <BilingualField label="标题" value={r.title} readOnly={!editable} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>标准正文</CardTitle>
          <CardDescription>Markdown。每个要看的点写成「### n.」标题，带技能 id。</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea aria-label="标准正文" defaultValue={r.body} readOnly={!editable} className="min-h-96 font-mono text-sm" />
        </CardContent>
      </Card>
    </Page>
  )
}
