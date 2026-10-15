import * as React from "react"
import DOMPurify from "dompurify"
import { Marked } from "marked"

import { SidePanel } from "@/components/content/side-panel"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import type { CaseForm, Form, Pair } from "@/lib/content"
import { dataSource } from "@/lib/data-source"
import { COPY, DIFFICULTY_LABEL } from "@/lib/labels"
import type { ChatMessage, Kind } from "@/lib/types"

type Lang = "zh" | "en"

/** Right-hand preview: the App's case card and intro, a try-out chat; a rubric shows only its text. */
export function PreviewPanel({
  kind,
  id,
  form,
  body,
  source,
  canChat,
  onClose,
}: {
  kind: Kind
  id: string
  form: Form
  body: string
  /** The unsaved edits as a whole .md, or undefined to play the saved draft. */
  source: string | undefined
  canChat: boolean
  onClose: () => void
}) {
  const [tab, setTab] = React.useState<"card" | "chat">("card")
  const [lang, setLang] = React.useState<Lang>("zh")
  const tabs = kind === "case" && canChat

  return (
    <SidePanel
      onClose={onClose}
      closeLabel="关闭预览"
      toolbar={
        <div className="flex items-center gap-2">
          {tabs ? (
            <Segmented label="预览" value={tab} onChange={setTab} options={[{ value: "card", label: "卡片" }, { value: "chat", label: "试聊" }]} />
          ) : (
            <span className="text-base font-semibold">预览</span>
          )}
          {kind === "case" && (
            <Segmented label="语言" value={lang} onChange={setLang} options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }]} />
          )}
        </div>
      }
    >
      {kind === "rubric" ? (
        <RubricPreview body={body} />
      ) : tab === "card" ? (
        <CardPreview form={form as CaseForm} lang={lang} />
      ) : (
        <ChatPreview key={lang} id={id} lang={lang} source={source} />
      )}
    </SidePanel>
  )
}

const t = (p: Pair, lang: Lang) => (lang === "en" && p.en.trim() ? p.en : p.zh)

function CardPreview({ form, lang }: { form: CaseForm; lang: Lang }) {
  const alias = t(form.clientAlias, lang)
  const title = t(form.title, lang)
  const en = lang === "en"
  const meta = [
    form.difficulty && (en ? { intro: "Intro", medium: "Medium", hard: "Hard" }[form.difficulty] : DIFFICULTY_LABEL[form.difficulty]),
    form.estimatedMinutes && (en ? `About ${form.estimatedMinutes} min` : `约 ${form.estimatedMinutes} 分钟`),
    ...form.tags.map((x) => t(x, lang)),
  ].filter(Boolean)
  const notes = t(form.contentNotes, lang) || (en ? "This session may touch on depression, anxiety and dark thoughts." : "可能涉及抑郁、焦虑和消极念头。")
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex gap-3 rounded-2xl border bg-background p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
          {(alias || title).slice(0, 1) || "?"}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-semibold">{alias ? `${alias} · ${title}` : title || "（未命名）"}</span>
          <span className="text-sm text-muted-foreground">{t(form.summary, lang)}</span>
          {meta.length > 0 && <span className="text-xs text-muted-foreground">{meta.join(" · ")}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border bg-background p-4 text-sm">
        <span className="text-xs font-medium text-muted-foreground">{en ? "First session" : "初次会谈"}</span>
        <Field label={en ? "Client" : "来访者"} text={t(form.clientIntro, lang)} />
        <Field label={en ? "What to practise" : "这次练什么"} text={form.practiceFocus.map((x) => t(x, lang)).join(" · ")} />
        <Field label={en ? "Content note" : "内容提示"} text={notes} />
      </div>
      <p className="text-xs text-muted-foreground">按草稿画出 App 的病例卡片和简介页。</p>
    </div>
  )
}

function Field({ label, text }: { label: string; text: string }) {
  if (!text) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold">{label}</span>
      <span className="text-foreground/80">{text}</span>
    </div>
  )
}

/** Raw HTML (and HTML comments) is dropped before rendering. */
const md = new Marked({ renderer: { html: () => "" } })

/**
 * The rendered rubric still goes through DOMPurify: links and images keep only http(s) and
 * mailto targets, so `[x](javascript:…)`, `<javascript:…>` and data: links can't run as the admin.
 */
function renderRubric(body: string) {
  const html = md.parse(body, { async: false }) as string
  return DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i, FORBID_TAGS: ["style", "form"] })
}

function RubricPreview({ body }: { body: string }) {
  const html = React.useMemo(() => renderRubric(body), [body])
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-xs text-muted-foreground">第一期只显示文字，不能试评。</p>
      <div
        className="text-sm leading-relaxed [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

function ChatPreview({ id, lang, source }: { id: string; lang: Lang; source: string | undefined }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [draft, setDraft] = React.useState("")
  const [streaming, setStreaming] = React.useState(false)
  const [ended, setEnded] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = React.useState(0)
  const [, tick] = React.useReducer((n: number) => n + 1, 0)
  const locked = lockedUntil > Date.now()
  React.useEffect(() => {
    if (!locked) return
    const t = setTimeout(tick, lockedUntil - Date.now() + 50)
    return () => clearTimeout(t)
  }, [locked, lockedUntil])
  const abort = React.useRef<AbortController | null>(null)
  const bottom = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => () => {
    abort.current?.abort()
  }, [])
  React.useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [messages])

  const restart = () => {
    abort.current?.abort()
    setMessages([])
    setEnded(false)
    setError(null)
    setStreaming(false)
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || streaming || ended || locked) return
    const history: ChatMessage[] = [...messages, { role: "counselor", text }]
    setMessages([...history, { role: "client", text: "" }])
    setDraft("")
    setError(null)
    setStreaming(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      for await (const frame of dataSource.previewChat(id, { locale: lang, messages: history, source }, ctrl.signal)) {
        if (frame.type === "text_delta")
          setMessages((m) => [...m.slice(0, -1), { role: "client", text: m[m.length - 1].text + frame.text }])
        else if (frame.type === "session_end") setEnded(true)
        else if (frame.type === "error") throw new ApiError(500, frame.code, frame.message)
      }
    } catch (e) {
      if (ctrl.signal.aborted) return
      setMessages(history.slice(0, -1))
      setDraft(text)
      const limited = e instanceof ApiError && e.status === 429
      if (limited) setLockedUntil(Date.now() + ((e as ApiError).retryAfter ?? 60) * 1000)
      setError(limited ? "试聊太频繁了，过一会儿再试。" : COPY.error)
    } finally {
      if (!ctrl.signal.aborted) setStreaming(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b px-4 py-2 text-xs text-muted-foreground">试聊用的是草稿，不保存，不计入统计。</p>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "counselor"
                ? "max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "max-w-[85%] self-start rounded-2xl rounded-bl-sm border bg-background px-3 py-2 text-sm"
            }
          >
            {m.text || <span className="text-muted-foreground">…</span>}
          </div>
        ))}
        {ended && <p className="self-center text-xs text-muted-foreground">来访者结束了会谈。</p>}
        {error && <p role="alert" className="self-center text-xs text-destructive">{error}</p>}
        <div ref={bottom} />
      </div>
      <form
        className="flex flex-col gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <Textarea
          aria-label="咨询师的话"
          placeholder="以咨询师的身份说第一句…"
          value={draft}
          disabled={ended}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send()
            }
          }}
          className="min-h-16 bg-background"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={restart}>
            重新开始
          </Button>
          <Button type="submit" size="sm" disabled={!draft.trim() || streaming || ended || locked}>
            发送
          </Button>
        </div>
      </form>
    </div>
  )
}
