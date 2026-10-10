// Everything the suite reads from the environment. See tests/contract/README.md.

const num = (v: string | undefined, fallback: number) =>
  v === undefined || v === "" ? fallback : Number(v);

export const env = {
  baseUrl: (process.env.CONTRACT_BASE_URL || "http://localhost:8787").replace(/\/+$/, ""),
  // A valid code from the server's INVITE_CODES. Set it when the server checks codes;
  // the invite tests then expect 401 for missing or wrong codes.
  inviteCode: process.env.INVITE_CODE || undefined,
  // Case to talk to. Default: the first one from GET /cases.
  caseId: process.env.CASE_ID || undefined,
  // Set to 1 when the server runs with no model configured: /chat and /supervision
  // must then answer 503 model_unavailable.
  expectModelUnavailable: process.env.EXPECT_MODEL_UNAVAILABLE === "1",
  streamTimeoutMs: num(process.env.STREAM_TIMEOUT_MS, 90_000),
  // Rate-limit test: how many requests to fire before giving up on seeing a 429.
  rateLimitBurst: num(process.env.RATE_LIMIT_BURST, 150),
};
