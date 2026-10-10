// Local Node server: `pnpm --filter api dev` (tsx watch) or `pnpm --filter api start` after a build.
// Reads apps/api/.env if present; variables already set in the shell win.
import { serve } from "@hono/node-server";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: use the shell environment.
}

// Imported after .env is loaded: the app reads its config at import time.
const { default: app } = await import("./index.js");
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`聆镜 PSYGYM api listening on http://localhost:${info.port}`);
});
