// What the app needs from sign-in. Types only: src/app.ts imports nothing from the auth module
// at run time, so with AUTH_MODE off a cold start loads no auth or database code.
import type { Hono } from "hono";

export interface AuthUser {
  id: string;
  email: string;
  createdAt: Date;
  inviteBatch: string | null;
}

export type AuthMode = "optional" | "required";

export interface Auth {
  /** "required" from AUTH_REQUIRED_FROM on, "optional" before. */
  mode(nowMs: number): AuthMode;
  /** The account behind a session token, renewing the session; null if none, expired or deleted. */
  authenticate(token: string): Promise<AuthUser | null>;
  /** POST /auth/start, POST /auth/verify, POST /auth/logout, GET /me, DELETE /me, POST /admin/accounts/delete. */
  routes: Hono;
  /** Fire and forget: the account was active today (a /chat or /supervision that ended well). */
  markActive(user: AuthUser): void;
  /** Days and weeks that are over go into daily_counts; their pseudonymous rows are deleted. */
  rollUp(): Promise<void>;
}
