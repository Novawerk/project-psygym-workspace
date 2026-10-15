import * as React from "react"
import { Link, type LinkProps } from "@tanstack/react-router"

export type Crumb = { label: string; to?: LinkProps["to"]; params?: LinkProps["params"]; mono?: boolean }

const CrumbsContext = React.createContext<{ crumbs: Crumb[]; set: (c: Crumb[]) => void }>({
  crumbs: [],
  set: () => {},
})

export function CrumbsProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, set] = React.useState<Crumb[]>([])
  const value = React.useMemo(() => ({ crumbs, set }), [crumbs])
  return <CrumbsContext.Provider value={value}>{children}</CrumbsContext.Provider>
}

/** Pages call this to put their trail in the top bar. */
export function useCrumbs(crumbs: Crumb[]) {
  const { set } = React.useContext(CrumbsContext)
  const key = JSON.stringify(crumbs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    set(crumbs)
  }, [key, set])
}

export function Crumbs() {
  const { crumbs } = React.useContext(CrumbsContext)
  return (
    <nav aria-label="面包屑" className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        const cls = `${c.mono ? "font-mono text-xs" : ""} ${last ? "text-foreground" : ""} truncate`
        return (
          <React.Fragment key={i}>
            {i > 0 && <span aria-hidden="true">/</span>}
            {c.to && !last ? (
              <Link to={c.to} params={c.params} className={`${cls} hover:text-foreground`}>
                {c.label}
              </Link>
            ) : (
              <span className={cls} aria-current={last ? "page" : undefined}>
                {c.label}
              </span>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
