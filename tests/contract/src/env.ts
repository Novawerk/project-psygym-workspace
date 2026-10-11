// Everything the suite reads from the environment. See tests/contract/README.md.

const num = (v: string | undefined, fallback: number) =>
  v === undefined || v === "" ? fallback : Number(v);

// No default on purpose: port 8787 is often another project's dev server. `pnpm test` stops
// earlier (scripts/require-base-url.mjs); this catches a bare `vitest run`.
const baseUrl = process.env.CONTRACT_BASE_URL?.trim();
if (!baseUrl) {
  throw new Error(
    "请设置 BASE_URL，例如 BASE_URL=http://localhost:8790（本机 8787 常被别的项目占着，我们不设默认值）。 / Set BASE_URL, e.g. BASE_URL=http://localhost:8790.",
  );
}

export const env = {
  baseUrl: baseUrl.replace(/\/+$/, ""),
  // A valid code from the server's INVITE_CODES. Set it when the server checks codes;
  // the invite tests then expect 401 for missing or wrong codes.
  inviteCode: process.env.INVITE_CODE || undefined,
  // Case to talk to. Default: the first one from GET /cases.
  caseId: process.env.CASE_ID || undefined,
  // Set to 1 when the server runs with no model configured: /chat and /supervision
  // must then answer 503 model_unavailable.
  expectModelUnavailable: process.env.EXPECT_MODEL_UNAVAILABLE === "1",
  // A counselor line that makes the server's mock client end the session (apps/api: "#end").
  // Mock only; with a real model the session_end tests are skipped.
  endTrigger: process.env.END_TRIGGER || undefined,
  streamTimeoutMs: num(process.env.STREAM_TIMEOUT_MS, 90_000),
  // Rate-limit test: how many requests to fire before giving up on seeing a 429.
  rateLimitBurst: num(process.env.RATE_LIMIT_BURST, 150),
};
