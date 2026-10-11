// The app, built from the environment. api/index.js (Vercel) and src/server.ts (local) both use it.
import { waitUntil } from "@vercel/functions";

import { consoleLogger, createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { loadCases, loadPrompts } from "./content.js";
import { createCounter, disabledCounter } from "./metrics/counter.js";

export async function appFromEnv(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  const logger = consoleLogger;
  // Database and sign-in code (drizzle-orm, pg, the auth module) load only when counting or
  // sign-in is on: with both off, a cold start loads none of it.
  const dbModule = config.metrics || config.auth ? await import("./metrics/db.js") : null;
  const metricsStore = config.metrics && dbModule ? dbModule.postgresStore(config.metrics.databaseUrl) : null;
  const counter = metricsStore
    ? createCounter({
        store: metricsStore,
        // On Vercel, keeps the function alive until the write settles; elsewhere a no-op.
        keepAlive: (p) => waitUntil(p),
        // The error's kind only: a driver message could carry connection details.
        onError: (err, e) => logger.error({ msg: "count failed", metric: e.metric, error: (err as Error)?.constructor?.name ?? typeof err }),
      })
    : disabledCounter;

  let auth = null;
  if (config.auth && dbModule) {
    const [{ createAuth }, { resendSender }] = await Promise.all([import("./auth/index.js"), import("./auth/email.js")]);
    auth = createAuth({
      config: config.auth,
      db: dbModule.connectDb(config.auth.databaseUrl),
      logger,
      keepAlive: (p) => waitUntil(p),
      sendCode: config.auth.resendKey ? resendSender({ apiKey: config.auth.resendKey, from: config.auth.emailFrom }) : null,
      alertWebhookUrl: config.feedbackWebhookUrl,
      countsEnabled: Boolean(config.metrics),
    });
  }
  logger.info({ msg: "metrics", enabled: counter.enabled });
  logger.info({ msg: "sign-in", enabled: Boolean(auth) });
  return createApp({ config, cases: loadCases(), prompts: loadPrompts(), logger, counter, metricsStore, auth });
}

export default await appFromEnv();
