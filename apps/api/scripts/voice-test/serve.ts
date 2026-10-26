// Voice spike only (docs/decisions/0013-voice-elevenlabs.md): serves the call test page at / and
// passes every other request on to the local API, so one public tunnel covers both. Not deployed.
//
//   pnpm --filter api dev                      # the API on :8787
//   tsx scripts/voice-test/serve.ts            # this on :8790
//   ngrok http 8790                            # then point the agent's custom LLM at <tunnel>/voice/llm/chat/completions
import { readFileSync } from "node:fs";
import { createServer, request } from "node:http";

const PORT = Number(process.env.VOICE_TEST_PORT ?? 8790);
const API = new URL(process.env.VOICE_TEST_API ?? "http://localhost:8787");
const page = readFileSync(new URL("./index.html", import.meta.url));

createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(page);
    return;
  }
  const upstream = request(
    { host: API.hostname, port: API.port, path: req.url, method: req.method, headers: { ...req.headers, host: API.host } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "upstream_unavailable", message: "The API is not running." } }));
  });
  req.pipe(upstream);
}).listen(PORT, () => console.log(`voice test page on http://localhost:${PORT}, API at ${API.origin}`));
