import { useSuspenseQuery } from "@tanstack/react-query"

import { meQueryOptions } from "@/lib/queries"

/** The signed-in admin. Only for pages under /_app, which loads it first. */
export function useMe() {
  return useSuspenseQuery(meQueryOptions).data
}
