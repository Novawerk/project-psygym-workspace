// The only place apps/admin reads import.meta.env. Everything else imports from here.

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8787").replace(/\/+$/, "")

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""

/**
 * Sample-data mode: fictional in-memory data, no sign-in. On until the admin API contract
 * lands; set VITE_USE_SAMPLE_DATA=false to talk to the API.
 */
export const USE_SAMPLE_DATA = import.meta.env.VITE_USE_SAMPLE_DATA !== "false"
