// Before the admin saves a model setting: one tiny call with that key and model, so a wrong key
// or a misspelt model never reaches the app (docs/decisions/0015-model-settings.md).
// We look at the HTTP status, and on a 400 at the error message (Anthropic says "credit balance"
// there). Nothing of it is logged.
import type { SettableProvider } from "./model-settings.js";

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export const CHECK_TIMEOUT_MS = 20_000;

/** Null: it works. Else the reason, in Chinese for the page. */
export async function checkModel(
  o: { provider: SettableProvider; model: string; key: string; baseURL?: string },
  fetchFn: FetchFn = fetch,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<string | null> {
  const signal = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    if (o.provider === "anthropic") {
      res = await fetchFn(`${o.baseURL ?? "https://api.anthropic.com"}/v1/messages`, {
        method: "POST",
        headers: { "x-api-key": o.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: o.model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
        signal,
      });
    } else {
      res = await fetchFn(`${o.baseURL ?? "https://api.deepseek.com"}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${o.key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: o.model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
        signal,
      });
    }
  } catch {
    return "连不上模型服务，请稍后再试。";
  }
  if (res.ok) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const text = await res.text().catch(() => "");
  if (/credit balance|insufficient balance/i.test(text)) return "这个账号的余额不够。";
  switch (res.status) {
    case 401:
    case 403:
      return "key 不对，或者已经作废了。";
    case 400:
    case 404:
      return `模型「${o.model}」用不了。检查一下名字。`;
    case 402:
      return "这个账号的余额不够。";
    case 429:
      return "调用太频繁，或者额度用完了。请稍后再试。";
    default:
      return `模型服务出错了（${res.status}），请稍后再试。`;
  }
}
