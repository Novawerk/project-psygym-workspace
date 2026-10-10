// Tests over a real Node HTTP server (@hono/node-server), for what app.request() can't show:
// keep-alive connections and client disconnects.
import http from "node:http";
import type { AddressInfo } from "node:net";

import { serve, type ServerType } from "@hono/node-server";
import { afterEach, describe, expect, it } from "vitest";

import { createApp, type Logger } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { loadCases, loadPrompts } from "../src/content.js";
import type { ModelProvider, ModelRequest, ModelResponse, StreamHandlers } from "../src/llm/types.js";

const cases = loadCases();
const prompts = loadPrompts();
const CASE_ID = [...cases.keys()][0]!;
const servers: ServerType[] = [];

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function start(providerFor?: () => ModelProvider) {
  const lines: Record<string, unknown>[] = [];
  const logger: Logger = { info: (l) => lines.push(l), error: (l) => lines.push(l) };
  const app = createApp({ config: loadConfig({ LLM_PROVIDER: "mock" }), cases, prompts, logger, ...(providerFor ? { providerFor } : {}) });
  const server = await new Promise<ServerType>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(s));
  });
  servers.push(server);
  return { port: (server.address() as AddressInfo).port, lines };
}

const chatBody = (text: string) =>
  JSON.stringify({ caseId: CASE_ID, locale: "zh", messages: [{ role: "counselor", text }] });

/** POST over one shared keep-alive agent. Resolves with status and body, or rejects (e.g. ECONNRESET). */
function postWith(agent: http.Agent, port: number, path: string, body: string, chunked = false) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "POST", agent, headers: { "Content-Type": "application/json", ...(chunked ? {} : { "Content-Length": Buffer.byteLength(body) }) } },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (chunked) {
      // Several writes without Content-Length → Transfer-Encoding: chunked.
      for (let i = 0; i < body.length; i += 64 * 1024) req.write(body.slice(i, i + 64 * 1024));
      req.end();
    } else req.end(body);
  });
}

describe("over a real server", () => {
  it.each([false, true])("an oversized body gets 400 and the next request on the connection works (chunked: %s)", async (chunked) => {
    const { port } = await start();
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    try {
      for (let i = 0; i < 3; i++) {
        const big = await postWith(agent, port, "/chat", chatBody("x".repeat(1_100_000)), chunked);
        expect(big.status).toBe(400);
        expect(JSON.parse(big.body).error.code).toBe("invalid_request");
        const ok = await postWith(agent, port, "/chat", chatBody("你好"));
        expect(ok.status).toBe(200);
        expect(ok.body).toContain('"type":"turn_end"');
      }
    } finally {
      agent.destroy();
    }
  });

  it("a client that disconnects aborts the upstream model call", async () => {
    let seen: AbortSignal | undefined;
    let started!: () => void;
    const upstreamStarted = new Promise<void>((r) => (started = r));
    const slow: ModelProvider = {
      name: "slow",
      model: "slow",
      buildRequest: (req) => req,
      stream(req: ModelRequest, h: StreamHandlers): Promise<ModelResponse> {
        seen = req.signal;
        h.onText?.("嗯");
        started();
        // Runs until aborted.
        return new Promise((_, reject) => req.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      },
    };
    const { port, lines } = await start(() => slow);

    const ctl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: chatBody("你好"),
      signal: ctl.signal,
    });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await reader.read(); // the first frame is here
    await upstreamStarted;
    expect(seen?.aborted).toBe(false);
    ctl.abort();

    await expect.poll(() => seen?.aborted, { timeout: 2000 }).toBe(true);
    await expect.poll(() => lines.some((l) => l.msg === "turn aborted"), { timeout: 2000 }).toBe(true);
    expect(lines.some((l) => l.msg === "turn failed")).toBe(false);
  });
});
