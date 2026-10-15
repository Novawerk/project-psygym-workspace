// What src/app.ts needs from the admin. Types only: the admin module itself is a dynamic import
// made on the first /admin request that needs it, so serving the app never loads it.
import type { Context, Hono } from "hono";

import type { Case } from "../content.js";
import type { ContentSource } from "../content-source.js";
import type { Locale, Message } from "../schema.js";

/** What the app gives the admin when it loads it. */
export interface AdminHooks {
  content: ContentSource;
  /** One /chat turn for a case that isn't published (preview): the same stream, not counted. */
  previewTurn(c: Context, theCase: Case, locale: Locale, messages: Message[]): Response | Promise<Response>;
}

/** Builds the admin routes (paths start with /admin). Called once per instance. */
export type AdminLoader = (hooks: AdminHooks) => Promise<Hono>;
