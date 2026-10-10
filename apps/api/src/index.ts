// The app, built from the environment. api/index.js (Vercel) and src/server.ts (local) both use it.
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { loadCases, loadPrompts } from "./content.js";

export function appFromEnv(env: Record<string, string | undefined> = process.env) {
  return createApp({ config: loadConfig(env), cases: loadCases(), prompts: loadPrompts() });
}

export default appFromEnv();
