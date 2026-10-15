// The app, built from the environment. api/index.js (Vercel) and src/server.ts (local) both use it.
import { waitUntil } from "@vercel/functions";

import { consoleLogger, createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { casesWithoutRubric, loadCases, loadPrompts } from "./content.js";
import { cachedContent } from "./content-source.js";
import { createCounter, disabledCounter } from "./metrics/counter.js";

export async function appFromEnv(env: Record<string, string | undefined> = process.env) {
  const config = loadConfig(env);
  const logger = consoleLogger;
  // Database and sign-in code (drizzle-orm, pg, the auth module) load only when counting,
  // sign-in, the admin or CONTENT_SOURCE=db is on: with all off, a cold start loads none of it.
  const dbModule = config.metrics || config.auth || config.admin || config.contentDb ? await import("./metrics/db.js") : null;
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
  const cases = loadCases();
  const prompts = loadPrompts();
  const orphans = casesWithoutRubric(cases, prompts.rubrics);
  if (orphans.length) throw new Error(`cases without a rubric for their school: ${orphans.join(", ")}`);

  // CONTENT_SOURCE=db: the published versions, cached 1 minute, the bundle as fallback.
  let content;
  if (config.contentDb && dbModule) {
    const { loadPublished } = await import("./content-db.js");
    const db = dbModule.connectDb(config.contentDb.databaseUrl);
    content = cachedContent({
      bundle: { cases, rubrics: prompts.rubrics, versions: new Map() },
      load: () => loadPublished(db),
      logger,
      keepAlive: (p) => waitUntil(p),
    });
  }

  // ADMIN_MODE=on: the admin module is imported on the first /admin request, not here.
  const adminConfig = config.admin;
  const admin =
    adminConfig && dbModule
      ? async (hooks: Parameters<NonNullable<Parameters<typeof createApp>[0]["admin"]>>[0]) => {
          const { createAdmin } = await import("./admin/index.js");
          return createAdmin({
            ...hooks,
            config: adminConfig,
            db: dbModule.connectDb(adminConfig.databaseUrl),
            logger,
            auth,
            webhookUrl: config.contentWebhookUrl,
            keepAlive: (p) => waitUntil(p),
          });
        }
      : null;

  logger.info({ msg: "metrics", enabled: counter.enabled });
  logger.info({ msg: "sign-in", enabled: Boolean(auth) });
  if (config.admin || config.contentDb) logger.info({ msg: "admin", enabled: Boolean(admin), content: content ? "db" : "files" });
  return createApp({ config, cases, prompts, logger, counter, metricsStore, auth, content, admin });
}

export default await appFromEnv();
