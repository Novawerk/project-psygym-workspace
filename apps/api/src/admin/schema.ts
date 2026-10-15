// Admin tables (docs/decisions/0009-admin-phase1.md): our own members, their sessions and logins,
// and the published versions and drafts of cases and rubrics. content_versions is never updated
// or deleted: it is the publish log.
import { bigserial, boolean, index, integer, pgSequence, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const admins = pgTable("admins", {
  id: text("id").primaryKey(), // random UUID
  email: text("email").notNull().unique(), // trimmed, lower-case
  /** Google's account id, set on the first sign-in; later sign-ins must match it. */
  googleSub: text("google_sub"),
  role: text("role").notNull(), // admin | editor | viewer
  org: text("org").notNull(), // novawerk | lingjing
  enabled: boolean("enabled").notNull().default(true),
  createdAt: at("created_at").notNull().defaultNow(),
  lastLoginAt: at("last_login_at"),
});

export const adminSessions = pgTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(), // sha256(token)
  adminId: text("admin_id")
    .notNull()
    .references(() => admins.id, { onDelete: "cascade" }),
  createdAt: at("created_at").notNull().defaultNow(),
  expiresAt: at("expires_at").notNull(),
});

/** Kept 90 days. No IP, no user agent. */
export const adminLogins = pgTable(
  "admin_logins",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adminId: text("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    at: at("at").notNull().defaultNow(),
  },
  (t) => [index("admin_logins_at_idx").on(t.at)],
);

export const contentVersions = pgTable(
  "content_versions",
  {
    kind: text("kind").notNull(), // case | rubric
    itemId: text("item_id").notNull(),
    version: integer("version").notNull(),
    /** The whole .md file, as in content/. */
    source: text("source").notNull(),
    action: text("action").notNull(), // import | publish | rollback
    fromVersion: integer("from_version"),
    /** "What changed", written by the publisher; at most 200 characters. Never sent to Slack. */
    note: text("note"),
    publishedBy: text("published_by").references(() => admins.id, { onDelete: "set null" }),
    publishedAt: at("published_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.itemId, t.version] }), index("content_versions_published_at_idx").on(t.publishedAt)],
);

/**
 * Draft revisions come from one sequence, so a number is never used twice, not even after a
 * draft is published or discarded and a new one started: a page holding an old revision always
 * gets 409.
 */
export const draftRevisions = pgSequence("content_draft_revisions");

/** At most one draft per item, shared by everyone who edits it. */
export const contentDrafts = pgTable(
  "content_drafts",
  {
    kind: text("kind").notNull(),
    itemId: text("item_id").notNull(),
    source: text("source").notNull(),
    revision: integer("revision").notNull(),
    baseVersion: integer("base_version"),
    updatedBy: text("updated_by").references(() => admins.id, { onDelete: "set null" }),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.itemId] })],
);
