import { createFileRoute } from "@tanstack/react-router"

import { ContentEditor } from "@/components/content/content-editor"

export const Route = createFileRoute("/_app/cases/$caseId")({
  validateSearch: (search: Record<string, unknown>): { v?: number } => {
    const v = Number(search.v)
    return Number.isInteger(v) && v > 0 ? { v } : {}
  },
  component: function CaseEditor() {
    const { caseId } = Route.useParams()
    const { v } = Route.useSearch()
    return <ContentEditor kind="case" id={caseId} version={v} />
  },
})
