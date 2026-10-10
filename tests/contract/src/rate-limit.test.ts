// Run on its own: pnpm test:contract:rate-limit
// It sends requests until the server answers 429, so it uses up the limiter for a while.
// With a real model this costs tokens; prefer a server running LLM_PROVIDER=mock.
import { expect, it } from "vitest";
import { env } from "./env";
import { call, expectError, retryAfterMs, validBody } from "./http";

it("POST /chat answers 429 rate_limited with Retry-After once the limit is hit", async () => {
  const body = await validBody();
  let limited: Response | undefined;
  let sent = 0;
  const batch = 10;
  while (!limited && sent < env.rateLimitBurst) {
    const rs = await Promise.all(
      Array.from({ length: batch }, () => call("/chat", { body, retryOn429: false })),
    );
    sent += batch;
    for (const r of rs) {
      if (r.status === 429 && !limited) limited = r;
      else await r.body?.cancel();
    }
  }
  expect(limited, `no 429 after ${sent} requests (raise RATE_LIMIT_BURST?)`).toBeDefined();
  const header = limited!.headers.get("retry-after");
  expect(header, "Retry-After header").not.toBeNull();
  expect(retryAfterMs(header), `Retry-After "${header}" is not seconds or an HTTP date`).toBeDefined();
  await expectError(limited!, 429, "rate_limited");
});
