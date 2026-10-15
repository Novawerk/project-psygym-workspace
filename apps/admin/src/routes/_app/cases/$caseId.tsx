import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ChevronLeftIcon, EyeIcon, SaveIcon } from "lucide-react"
import { toast } from "sonner"

import { BilingualField } from "@/components/content/bilingual-field"
import { PublishButton } from "@/components/content/publish-button"
import { VersionHistory } from "@/components/content/version-history"
import { Page, PendingContract } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useMe } from "@/hooks/use-me"
import { DIFFICULTY_LABEL, canEdit } from "@/lib/labels"
import { caseQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/_app/cases/$caseId")({
  component: CaseEditPage,
})

/** Fields follow content/README.md. Chinese and English side by side; the body is one markdown text. */
function CaseEditPage() {
  const { caseId } = Route.useParams()
  const me = useMe()
  const editable = canEdit(me.role)
  const { data: c } = useQuery(caseQueryOptions(caseId))

  if (!c) {
    return (
      <Page title={<Skeleton className="h-7 w-48" />}>
        <Skeleton className="h-64 w-full" />
      </Page>
    )
  }
  const f = c.fields

  return (
    <Page
      title={
        <span className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link to="/cases" />} aria-label="回到病例列表">
            <ChevronLeftIcon />
          </Button>
          {f.title.zh}
          {c.publishedVersion && <Badge variant="secondary">已发布 v{c.publishedVersion}</Badge>}
          {c.hasDraft && <Badge variant="outline">有草稿</Badge>}
        </span>
      }
      description={<span className="font-mono text-xs">{c.id}</span>}
      actions={
        <>
          <VersionHistory versions={c.versions} current={c.publishedVersion} canRestore={editable} />
          <Button variant="outline" size="sm" onClick={() => toast("预览：等设计稿第 ⑩ 行。")}>
            <EyeIcon /> 预览
          </Button>
          {editable && (
            <>
              <Button variant="outline" size="sm" onClick={() => toast("保存草稿：等接口合同。")}>
                <SaveIcon /> 保存草稿
              </Button>
              <PublishButton what={f.title.zh} nextVersion={(c.publishedVersion ?? 0) + 1} />
            </>
          )}
        </>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>选病例时看到的</CardTitle>
          <CardDescription>病例卡片和简介页。不剧透核心信念。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <BilingualField label="病例名" hint="10 字以内" value={f.title} readOnly={!editable} />
          <BilingualField label="简介" value={f.summary} multiline readOnly={!editable} />
          <BilingualField label="来访者化名" value={f.clientAlias} readOnly={!editable} />
          <BilingualField label="来访者介绍" hint="2–3 句" value={f.clientIntro} multiline readOnly={!editable} />
          {f.tags.map((t, i) => (
            <BilingualField key={`tag-${i}`} label={`主题标签 ${i + 1}`} hint="最多 3 个" value={t} readOnly={!editable} />
          ))}
          {f.practiceFocus.map((p, i) => (
            <BilingualField key={`focus-${i}`} label={`这次练什么 ${i + 1}`} value={p} readOnly={!editable} />
          ))}
          <BilingualField label="内容提示" value={f.contentNotes} multiline readOnly={!editable} />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label>流派</Label>
              <Input defaultValue={f.school} readOnly />
            </div>
            <div className="flex flex-col gap-2">
              <Label>难度</Label>
              <Input defaultValue={DIFFICULTY_LABEL[f.difficulty]} readOnly={!editable} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>预计时长（分钟）</Label>
              <Input type="number" defaultValue={f.estimatedMinutes} readOnly={!editable} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>给 AI 来访者的角色说明</CardTitle>
          <CardDescription>Markdown。基本情况、主诉、症状、认知模式、说话风格、阻抗……照 content/README.md。</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="角色说明正文"
            defaultValue={f.body}
            readOnly={!editable}
            className="min-h-80 font-mono text-sm"
          />
        </CardContent>
      </Card>

      <PendingContract>试聊侧栏（用草稿和 AI 来访者聊，不存、不计数）：等设计稿和接口。</PendingContract>
    </Page>
  )
}
