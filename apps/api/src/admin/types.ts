// What src/app.ts needs from the admin. Types only: the admin module itself is a dynamic import
// made on the first /admin request that needs it, so serving the app never loads it.
import type { Context, Hono } from "hono";

import type { Role, RoleLlm } from "../config.js";
import type { Case } from "../content.js";
import type { ContentSource } from "../content-source.js";
import type { ModelsView, StoredSettings } from "../model-settings.js";
import type { Locale, Message, SessionInfo } from "../schema.js";

/** What the app gives the admin when it loads it. */
export interface AdminHooks {
  content: ContentSource;
  /** One /chat turn for a case that isn't published (preview): the same stream, not counted. */
  previewTurn(c: Context, theCase: Case, locale: Locale, messages: Message[], session?: SessionInfo): Response | Promise<Response>;
  /** Model settings (docs/decisions/0015-model-settings.md); null when they are off. */
  models?: ModelHooks | null;
}

export interface ModelHooks {
  /** The config each role would use with these settings. */
  effective(s: StoredSettings): Record<Role, RoleLlm>;
  view(s: StoredSettings): ModelsView;
  /** After a save: this instance loads the settings again now. */
  refresh(): Promise<void>;
}

/** Builds the admin routes (paths start with /admin). Called once per instance. */
export type AdminLoader = (hooks: AdminHooks) => Promise<Hono>;
