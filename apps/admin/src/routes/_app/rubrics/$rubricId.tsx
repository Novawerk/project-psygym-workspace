import { createFileRoute } from "@tanstack/react-router"

import { ContentEditor } from "@/components/content/content-editor"

export const Route = createFileRoute("/_app/rubrics/$rubricId")({
  component: function RubricEditor() {
    const { rubricId } = Route.useParams()
    return <ContentEditor kind="rubric" id={rubricId} />
  },
})
