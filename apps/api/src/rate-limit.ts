// A small fixed-window limiter, in this process's memory.
//
// Serverless instances share no memory, so on Vercel the real limit is "N per window per warm
// instance": a brake on casual abuse, not a hard guarantee. Good enough for an invite-only demo.
import type { Context } from "hono";

export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one hit for `key`. Returns 0 when allowed, else the seconds until the window resets. */
  take(key: string): number {
    const t = this.now();
    if (this.hits.size > 10_000) this.prune(t);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return 0;
    }
    if (entry.count >= this.limit) return Math.max(1, Math.ceil((entry.resetAt - t) / 1000));
    entry.count++;
    return 0;
  }

  private prune(t: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= t) this.hits.delete(key);
  }
}

/** On Vercel the platform sets x-forwarded-for; without a proxy everyone shares "unknown". */
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || c.req.header("x-real-ip")?.trim() || "unknown";
}
