// The app, built from the environment. api/index.js (Vercel) and src/server.ts (local) both use it.
import { waitUntil } from "@vercel/functions";

import { consoleLogger, createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { loadCases, loadPrompts } from "./content.js";
import { createCounter, disabledCounter } from "./metrics/index.js";
import { postgresStore } from "./metrics/db.js";

export function appFromEnv(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  const logger = consoleLogger;
  const metricsStore = config.metrics ? postgresStore(config.metrics.databaseUrl) : null;
  const counter = metricsStore
    ? createCounter({
        store: metricsStore,
        // On Vercel, keeps the function alive until the write settles; elsewhere a no-op.
        keepAlive: (p) => waitUntil(p),
        // The error's kind only: a driver message could carry connection details.
        onError: (err, e) => logger.error({ msg: "count failed", metric: e.metric, error: (err as Error)?.constructor?.name ?? typeof err }),
      })
    : disabledCounter;
  logger.info({ msg: "metrics", enabled: counter.enabled });
  return createApp({ config, cases: loadCases(), prompts: loadPrompts(), logger, counter, metricsStore });
}

export default appFromEnv();
