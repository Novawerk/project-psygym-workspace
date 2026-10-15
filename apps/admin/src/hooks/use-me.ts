import { useSuspenseQuery } from "@tanstack/react-query"

import { canWrite } from "@/lib/labels"
import { meQueryOptions } from "@/lib/queries"

/** The signed-in admin. Only for pages under /_app, which loads it first. */
export function useMe() {
  const me = useSuspenseQuery(meQueryOptions).data
  return { ...me, canWrite: canWrite(me.role) }
}
