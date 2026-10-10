// A small fixed-window limiter, in this process's memory.
//
// Serverless instances share no memory, so on Vercel the real limit is "N per window per warm
// instance": a brake on casual abuse, not a hard guarantee. Good enough for an invite-only demo.
import type { Context } from "hono";

/** Most keys we keep. Past this we drop expired windows, then the oldest ones. */
export const MAX_KEYS = 10_000;

export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = MAX_KEYS,
  ) {}

  get size() {
    return this.hits.size;
  }

  /** Counts one hit for `key`. Returns 0 when allowed, else the seconds until the window resets. */
  take(key: string): number {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      // Re-insert, so Map order stays "oldest window first".
      this.hits.delete(key);
      if (this.hits.size >= this.maxKeys) this.evict(t);
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return 0;
    }
    if (entry.count >= this.limit) return Math.max(1, Math.ceil((entry.resetAt - t) / 1000));
    entry.count++;
    return 0;
  }

  private evict(t: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= t) this.hits.delete(key);
    // Still full: drop the oldest windows (Map iterates in insertion order).
    for (const key of this.hits.keys()) {
      if (this.hits.size < this.maxKeys) break;
      this.hits.delete(key);
    }
  }
}

/** On Vercel the platform sets x-forwarded-for; without a proxy everyone shares "unknown". */
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || c.req.header("x-real-ip")?.trim() || "unknown";
}
