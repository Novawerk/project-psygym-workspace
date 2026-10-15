// The only place apps/admin reads import.meta.env. Everything else imports from here.

/**
 * Where the admin API lives. In production a Vercel rewrite sends /api/* on the admin domain to
 * psygym-api (same-origin cookie); locally the Vite dev server proxies /api to apps/api on port 8790.
 */
export const API_BASE = "/api"

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""

/**
 * Sample-data mode: an in-memory store, no sign-in. Only when VITE_USE_SAMPLE_DATA is exactly
 * "true": a missing or mistyped variable must never put fake data without sign-in online.
 */
export const USE_SAMPLE_DATA = import.meta.env.VITE_USE_SAMPLE_DATA === "true"
