// A tiny server that follows docs/api-contract.md. Test fixture only: it lets us check
// the contract suite itself before apps/api exists. Not the product backend.
//
//   PORT=8799 INVITE_CODES=a,b RATE_LIMIT=40 NO_MODEL=1 node scripts/reference-server.mjs
//
// FAULT=<name> makes every POST /chat and /supervision fail one way, for walking the app
// through its error states (docs/test-plan.md):
//   invalid_request | invite_required | case_not_found | rate_limited | model_unavailable
//     → that HTTP error before the stream
//   stream_error → turn_start, some text, then an error frame
//   slow         → text in small pieces every 300 ms, with ": ping" comments
//   hang         → turn_start, then nothing (the app's own timeout must kick in)
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8799);
const INVITES = (process.env.INVITE_CODES ?? "").split(",").filter(Boolean);
const RATE_LIMIT = Number(process.env.RATE_LIMIT ?? 0); // requests per minute per IP on POST; 0 = off
const NO_MODEL = process.env.NO_MODEL === "1";
const MAX_BODY = 512 * 1024;
const FAULT = process.env.FAULT ?? "";
const FAULT_STATUS = {
  invalid_request: 400,
  invite_required: 401,
  case_not_found: 404,
  rate_limited: 429,
  model_unavailable: 503,
};
if (FAULT && !(FAULT in FAULT_STATUS) && !["stream_error", "slow", "hang"].includes(FAULT)) {
  console.error(`unknown FAULT=${FAULT}`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHAT_REPLY = "嗯……最近总是睡不好，早上起来也没什么力气。我也说不清楚为什么。";
const REPORT = [
  "## 做得好的地方\n\n- 开场问题开放，给了来访者空间。\n\n",
  "## 需要改进的地方\n\n- 太快给了建议，没有先探索。你说：「你应该多出去走走」。可以换成：出门这件事，对你来说难在哪里？\n\n",
  "## 下次练什么\n\n- 多用情感反映。\n- 先问具体情境，再问想法。\n\n",
  "这份反馈由 AI 生成，仅供练习参考。\n",
].join("");

// Mid-session notes (/supervision mode "live"): no headings, at most 3 items, no AI line.
const LIVE_NOTES = "- 你的开场问题很开放，给了来访者空间。\n- 接下来可以先说出对方的感受。可以换成：那对你来说是什么感觉？\n";

const CASES = [
  {
    id: "cbt-depression",
    school: "cbt",
    title: { zh: "抑郁（示例）", en: "Depression (sample)" },
    summary: { zh: "测试用示例病例。", en: "A sample case for tests." },
  },
];

const hits = { chat: new Map(), feedback: new Map(), report: new Map() };

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}
const fail = (res, status, code, headers) => json(res, status, { error: { code, message: code } }, headers);

function valid(b, path) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  if (typeof b.caseId !== "string" || !["zh", "en"].includes(b.locale)) return false;
  const m = b.messages;
  if (!Array.isArray(m) || m.length === 0 || m.length > 80) return false;
  for (const x of m) {
    if (!x || !["counselor", "client"].includes(x.role) || typeof x.text !== "string" || x.text.length > 2000) return false;
  }
  // /supervision: mode is "final" (default) or "live"; anything else is a 400.
  if (path === "/supervision" && "mode" in b && !["final", "live"].includes(b.mode)) return false;
  // Only /chat needs the counselor's line last.
  return path !== "/chat" || m[m.length - 1].role === "counselor";
}

// POST /feedback: only these fields; the conversation is never one of them.
function validFeedback(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  if (Object.keys(b).some((k) => !["caseId", "locale", "rating", "comment"].includes(k))) return false;
  if (typeof b.caseId !== "string" || !["zh", "en"].includes(b.locale) || !["up", "down"].includes(b.rating)) return false;
  return b.comment === undefined || (typeof b.comment === "string" && [...b.comment].length <= 500);
}

// POST /report: exactly one passage; never the rest of the session.
function validReport(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  const keys = ["caseId", "locale", "source", "reason", "comment", "reportedText"];
  if (Object.keys(b).some((k) => !keys.includes(k))) return false;
  if (typeof b.caseId !== "string" || !["zh", "en"].includes(b.locale)) return false;
  if (!["client_reply", "report"].includes(b.source)) return false;
  if (!["harmful", "out_of_role", "unsafe_advice", "other"].includes(b.reason)) return false;
  if (typeof b.reportedText !== "string" || [...b.reportedText].length < 1 || [...b.reportedText].length > 2000) return false;
  return b.comment === undefined || (typeof b.comment === "string" && [...b.comment].length <= 500);
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });

  if (INVITES.length && !INVITES.includes(req.headers["x-invite-code"])) return fail(res, 401, "invite_required");

  if (req.method === "GET" && url.pathname === "/cases") return json(res, 200, { cases: CASES });

  if (req.method !== "POST" || !["/chat", "/supervision", "/feedback", "/report"].includes(url.pathname)) return fail(res, 404, "not_found");

  if (RATE_LIMIT) {
    // /feedback and /report have their own buckets; /chat and /supervision share one.
    const bucket = hits[url.pathname === "/feedback" ? "feedback" : url.pathname === "/report" ? "report" : "chat"];
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    const recent = (bucket.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= RATE_LIMIT) return fail(res, 429, "rate_limited", { "retry-after": "60" });
    recent.push(now);
    bucket.set(ip, recent);
  }

  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) {
      req.resume();
      return fail(res, 400, "invalid_request", { connection: "close" });
    }
    chunks.push(c);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return fail(res, 400, "invalid_request");
  }
  if (url.pathname === "/feedback") {
    if (!validFeedback(body)) return fail(res, 400, "invalid_request");
    if (!CASES.some((c) => c.id === body.caseId)) return fail(res, 404, "case_not_found");
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/report") {
    if (!validReport(body)) return fail(res, 400, "invalid_request");
    if (!CASES.some((c) => c.id === body.caseId)) return fail(res, 404, "case_not_found");
    res.writeHead(204);
    return res.end();
  }
  if (!valid(body, url.pathname)) return fail(res, 400, "invalid_request");
  if (!CASES.some((c) => c.id === body.caseId)) return fail(res, 404, "case_not_found");
  if (FAULT_STATUS[FAULT]) {
    return fail(res, FAULT_STATUS[FAULT], FAULT, FAULT === "rate_limited" ? { "retry-after": "30" } : {});
  }
  if (NO_MODEL) return fail(res, 503, "model_unavailable");

  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" });
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  send({ type: "turn_start" });
  res.write(": ping\n\n");
  const text = url.pathname === "/chat" ? CHAT_REPLY : body.mode === "live" ? LIVE_NOTES : REPORT;
  if (FAULT === "hang") return; // leave the stream open
  // Like apps/api's mock: "#end" in the counselor's last line ends the session (/chat only).
  const last = body.messages[body.messages.length - 1];
  if (url.pathname === "/chat" && last.role === "counselor" && last.text.includes("#end")) {
    send({ type: "text_delta", text: "……那我先走了。" });
    send({ type: "session_end" });
    send({ type: "turn_end" });
    return res.end();
  }
  if (FAULT === "stream_error") {
    send({ type: "text_delta", text: text.slice(0, 8) });
    send({ type: "error", code: "model_unavailable", message: "model_unavailable" });
    return res.end();
  }
  const pieces = text.match(FAULT === "slow" ? /[\s\S]{1,3}/g : /[\s\S]{1,12}/g);
  for (const [i, piece] of pieces.entries()) {
    if (FAULT === "slow") {
      await sleep(300);
      if (i % 7 === 6) res.write(": ping\n\n");
    }
    send({ type: "text_delta", text: piece });
  }
  send({ type: "turn_end", usage: { inputTokens: 1, outputTokens: pieces.length } });
  res.end();
}).listen(PORT, "127.0.0.1", () => console.log(`reference server on http://127.0.0.1:${PORT}${FAULT ? ` (FAULT=${FAULT})` : ""}`));
