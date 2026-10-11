// Sign-in tables (docs/decisions/0008-sign-in.md). Nothing about a person beyond the email,
// the sign-up time and the invite batch. Codes, tokens and IPs are stored only as MACs/hashes.
import { date, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // random UUID
  email: text("email").notNull().unique(), // trimmed, lower-case
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  inviteBatch: text("invite_batch"),
});

/** One pending code per email. The email itself isn't stored until the account exists. */
export const loginCodes = pgTable("login_codes", {
  emailHash: text("email_hash").primaryKey(), // sha256(email)
  codeMac: text("code_mac").notNull(), // HMAC(AUTH_SECRET, email_hash:code)
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  triesLeft: integer("tries_left").notNull(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true, mode: "date" }).notNull(),
  /** The hour the sends below count in, for "5 per email per hour". */
  windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
  sendsInWindow: integer("sends_in_window").notNull(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(), // sha256(token)
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  /** The last day the expiry moved forward (at most once a day). */
  renewedOn: date("renewed_on", { mode: "string" }).notNull(),
});

/** Hourly counters for limits that must hold across instances. Keys are MACs, never clear IPs. */
export const rateCounters = pgTable(
  "rate_counters",
  {
    keyMac: text("key_mac").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.keyMac, t.windowStart] }), index("rate_counters_window_start_idx").on(t.windowStart)],
);

/** Pseudonymous active accounts per day / ISO week; rolled up into daily_counts, then deleted. */
export const activeDay = pgTable("active_day", { day: date("day", { mode: "string" }).notNull(), pid: text("pid").notNull() }, (t) => [
  primaryKey({ columns: [t.day, t.pid] }),
]);
export const activeWeek = pgTable("active_week", { week: text("week").notNull(), pid: text("pid").notNull() }, (t) => [
  primaryKey({ columns: [t.week, t.pid] }),
]);
