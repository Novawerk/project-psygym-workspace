import { createFileRoute } from "@tanstack/react-router"

import { ContentEditor } from "@/components/content/content-editor"

export const Route = createFileRoute("/_app/rubrics/$rubricId")({
  validateSearch: (search: Record<string, unknown>): { v?: number } => {
    const v = Number(search.v)
    return Number.isInteger(v) && v > 0 ? { v } : {}
  },
  component: function RubricEditor() {
    const { rubricId } = Route.useParams()
    const { v } = Route.useSearch()
    return <ContentEditor kind="rubric" id={rubricId} version={v} />
  },
})
