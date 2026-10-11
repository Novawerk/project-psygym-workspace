// The code email, sent with Resend's HTTP API (no SDK). Plain text, no links, no images; the code
// in the subject so it shows in the notification (docs/product/login.md §3).
import type { Locale } from "../schema.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type SendCode = (to: string, code: string, locale: Locale) => Promise<void>;

const TEXT: Record<Locale, (code: string) => { subject: string; text: string }> = {
  zh: (code) => ({
    subject: `聆镜 PSYGYM 验证码：${code}`,
    text: [
      `你的验证码是 ${code}，10 分钟内有效。`,
      "",
      "在 App 里输入这 6 位数字就能登录。",
      "",
      "不是你本人在登录？忽略这封邮件就好，没有人能用它登录你的账号。",
      "",
      "聆镜 PSYGYM 是给心理咨询师的练习工具。请不要回复这封邮件；有问题请写信到 info@novawerk.io。",
    ].join("\n"),
  }),
  en: (code) => ({
    subject: `Your 聆镜 PSYGYM code: ${code}`,
    text: [
      `Your code is ${code}. It works for 10 minutes.`,
      "",
      "Enter these 6 digits in the app to sign in.",
      "",
      "Didn't try to sign in? Just ignore this email. Nobody can use it to get into your account.",
      "",
      "聆镜 PSYGYM is a practice tool for counselors. Please don't reply to this email; write to info@novawerk.io with any questions.",
    ].join("\n"),
  }),
};

/** Throws on a failed send; the caller logs the error's kind only. */
export function resendSender(opts: { apiKey: string; from: string; fetch?: FetchLike; timeoutMs?: number }): SendCode {
  const fetchFn = opts.fetch ?? fetch;
  return async (to, code, locale) => {
    const { subject, text } = TEXT[locale](code);
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: opts.from, to: [to], subject, text }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    await res.body?.cancel().catch(() => {});
    if (!res.ok) throw new ResendError(res.status);
  };
}

export class ResendError extends Error {
  constructor(readonly status: number) {
    super(`resend ${status}`);
  }
}

export const codeEmailText = TEXT;
