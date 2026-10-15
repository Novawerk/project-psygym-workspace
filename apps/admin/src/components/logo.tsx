import { cn } from "@/lib/utils"

/** The admin mark from design row ⑩: a rounded square with a mirror ring. Follows the theme. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={cn("size-7 shrink-0", className)}>
      <rect width="28" height="28" rx="7" className="fill-primary" />
      <circle cx="14" cy="14" r="7" fill="none" strokeWidth="2" className="stroke-primary-foreground" />
      <circle cx="11.5" cy="14" r="1.6" className="fill-primary-foreground" />
      <circle cx="16.5" cy="14" r="1.6" className="fill-primary-foreground" />
    </svg>
  )
}
