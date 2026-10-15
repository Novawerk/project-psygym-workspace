import { createFileRoute } from "@tanstack/react-router"

import { ContentList } from "@/components/content/content-list"

export const Route = createFileRoute("/_app/rubrics/")({
  component: () => <ContentList kind="rubric" />,
})
