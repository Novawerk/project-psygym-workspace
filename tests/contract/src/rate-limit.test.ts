// Run on its own: pnpm test:contract:rate-limit
// It sends requests until the server answers 429, so it uses up the limiter for a while.
// With a real model this costs tokens; prefer a server running LLM_PROVIDER=mock.
import { expect, it } from "vitest";
import { env } from "./env";
import { call, expectError, retryAfterMs, validBody } from "./http";

/** Send `path` in batches of 10 until one answers 429; return it (or undefined). */
async function burst(path: string, body: unknown): Promise<{ limited?: Response; sent: number }> {
  let limited: Response | undefined;
  let sent = 0;
  while (!limited && sent < env.rateLimitBurst) {
    const rs = await Promise.all(Array.from({ length: 10 }, () => call(path, { body, retryOn429: false })));
    sent += 10;
    for (const r of rs) {
      if (r.status === 429 && !limited) limited = r;
      else await r.body?.cancel();
    }
  }
  return { limited, sent };
}

it("POST /chat answers 429 rate_limited with Retry-After once the limit is hit", async () => {
  const { limited, sent } = await burst("/chat", await validBody());
  expect(limited, `no 429 after ${sent} requests (raise RATE_LIMIT_BURST?)`).toBeDefined();
  const header = limited!.headers.get("retry-after");
  expect(header, "Retry-After header").not.toBeNull();
  expect(retryAfterMs(header), `Retry-After "${header}" is not seconds or an HTTP date`).toBeDefined();
  await expectError(limited!, 429, "rate_limited");
});

it("POST /feedback has its own bucket: still 204 while /chat is limited, then 429 on its own", async () => {
  // /chat is limited by the test above (same window).
  const chat = await call("/chat", { body: await validBody(), retryOn429: false });
  await chat.body?.cancel();
  expect(chat.status, "/chat should still be limited here").toBe(429);

  const fb = { caseId: (await validBody()).caseId, locale: "zh", rating: "up" };
  const first = await call("/feedback", { body: fb, retryOn429: false });
  expect(first.status, "/feedback must not share /chat's bucket").toBe(204);
  await first.body?.cancel();

  const { limited, sent } = await burst("/feedback", fb);
  expect(limited, `no 429 on /feedback after ${sent} requests`).toBeDefined();
  expect(retryAfterMs(limited!.headers.get("retry-after"))).toBeDefined();
  await expectError(limited!, 429, "rate_limited");
});
