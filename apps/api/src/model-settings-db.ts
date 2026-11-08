// Model settings in the database (docs/decisions/0015-model-settings.md). Loaded only when the
// admin and MODEL_SETTINGS_SECRET are on.
import { eq } from "drizzle-orm";

import type { Logger } from "./app.js";
import type { Role } from "./config.js";
import { modelSettings } from "./admin/schema.js";
import type { MetricsDb } from "./metrics/store.js";
import { EMPTY, SETTABLE, decrypt, type RoleChoice, type SettableProvider, type StoredSettings } from "./model-settings.js";

export const ROW_ID = "current";
type Row = typeof modelSettings.$inferSelect;

const isSettable = (p: string | null): p is SettableProvider => p !== null && (SETTABLE as readonly string[]).includes(p);

function choice(provider: string | null, model: string | null): RoleChoice | undefined {
  return isSettable(provider) ? { provider, model: model ?? "" } : undefined;
}

/** A row → settings. A key that no longer decrypts (the secret changed) is left out, with a log line. */
export function settingsFrom(row: Row | undefined, secret: string, logger: Logger): StoredSettings {
  if (!row) return EMPTY;
  const roles: Partial<Record<Role, RoleChoice>> = {};
  const c = choice(row.clientProvider, row.clientModel);
  const s = choice(row.supervisorProvider, row.supervisorModel);
  if (c) roles.client = c;
  if (s) roles.supervisor = s;
  const keys: StoredSettings["keys"] = {};
  const hints: StoredSettings["hints"] = {};
  const sealed: Record<SettableProvider, [string | null, string | null]> = {
    anthropic: [row.anthropicKey, row.anthropicKeyHint],
    deepseek: [row.deepseekKey, row.deepseekKeyHint],
  };
  for (const p of SETTABLE) {
    const [value, hint] = sealed[p];
    if (!value) continue;
    try {
      keys[p] = decrypt(secret, value);
      hints[p] = hint ?? keys[p]!.slice(-4);
    } catch {
      logger.error({ msg: "model settings: a stored key does not decrypt (MODEL_SETTINGS_SECRET changed?); ignored", provider: p });
    }
  }
  return { roles, keys, hints, updatedAt: row.updatedAt };
}

export async function loadSettings(db: MetricsDb, secret: string, logger: Logger): Promise<StoredSettings> {
  const [row] = await db.select().from(modelSettings).where(eq(modelSettings.id, ROW_ID)).limit(1);
  return settingsFrom(row, secret, logger);
}
