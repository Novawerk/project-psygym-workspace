import { expect } from "vitest";
import { env } from "./env";

export type Role = "counselor" | "client";
export type Message = { role: Role; text: string };
export type Locale = "zh" | "en";

type Opts = {
  method?: "GET" | "POST";
  body?: unknown;
  /** raw string body, sent as is (for broken JSON and oversized bodies) */
  rawBody?: string;
  /** undefined → send env.inviteCode if set; null → send no header; string → send that */
  invite?: string | null;
  /** retry when the server answers 429 (the rate-limit test turns this off) */
  retryOn429?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function retryAfterMs(h: string | null): number | undefined {
  if (h === null) return undefined;
  if (/^\d+$/.test(h.trim())) return Number(h.trim()) * 1000;
  const t = Date.parse(h);
  return Number.isNaN(t) ? undefined : Math.max(0, t - Date.now());
}

export async function call(path: string, opts: Opts = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  const invite = opts.invite === undefined ? env.inviteCode : opts.invite;
  if (invite !== null && invite !== undefined) headers["X-Invite-Code"] = invite;
  let body: string | undefined;
  if (opts.rawBody !== undefined) body = opts.rawBody;
  else if (opts.body !== undefined) body = JSON.stringify(opts.body);
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // Other tests must not fail just because the server's limiter is tight.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(env.baseUrl + path, {
      method: opts.method ?? (body !== undefined ? "POST" : "GET"),
      headers,
      body,
    });
    const wait = retryAfterMs(res.headers.get("retry-after"));
    if (res.status === 429 && opts.retryOn429 !== false && attempt < 3 && wait !== undefined && wait <= 65_000) {
      await res.body?.cancel();
      await sleep(wait + 250);
      continue;
    }
    return res;
  }
}

/** Assert the pre-stream error shape: `{ error: { code, message } }` with the given status. */
export async function expectError(res: Response, status: number, code: string) {
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}, body is not JSON: ${text.slice(0, 200)}`);
  }
  expect({ status: res.status, code: json?.error?.code }, text.slice(0, 300)).toEqual({ status, code });
  expect(typeof json.error.message).toBe("string");
  expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/);
  return json;
}

let cachedCaseId: string | undefined;

export async function caseId(): Promise<string> {
  if (env.caseId) return env.caseId;
  if (cachedCaseId) return cachedCaseId;
  const res = await call("/cases");
  const json = (await res.json()) as { cases: { id: string }[] };
  if (!json.cases?.length) throw new Error("GET /cases returned no cases; set CASE_ID");
  cachedCaseId = json.cases[0].id;
  return cachedCaseId;
}

export const opening: Record<Locale, string> = {
  zh: "你好，今天想聊些什么？",
  en: "Hi, what would you like to talk about today?",
};

export async function validBody(locale: Locale = "zh", messages?: Message[]) {
  return {
    caseId: await caseId(),
    locale,
    messages: messages ?? [{ role: "counselor", text: opening[locale] }],
  };
}

/** n alternating messages that end with the counselor. */
export function conversation(n: number, text = "嗯。"): Message[] {
  return Array.from({ length: n }, (_, i) => ({
    role: (n - 1 - i) % 2 === 0 ? "counselor" : "client",
    text,
  }));
}
