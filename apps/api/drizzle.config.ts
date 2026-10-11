import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` writes SQL migrations to drizzle/; `pnpm db:migrate` applies them to
// DATABASE_URL_UNPOOLED (Neon's direct connection) or DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/metrics/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "" },
});
