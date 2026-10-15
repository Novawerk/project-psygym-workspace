import { createFileRoute } from "@tanstack/react-router"

import { ContentEditor } from "@/components/content/content-editor"

export const Route = createFileRoute("/_app/cases/$caseId")({
  component: function CaseEditor() {
    const { caseId } = Route.useParams()
    return <ContentEditor kind="case" id={caseId} />
  },
})
