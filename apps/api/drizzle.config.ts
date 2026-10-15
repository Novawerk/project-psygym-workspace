import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` writes SQL migrations to drizzle/.
// `pnpm db:migrate` applies them to DATABASE_URL_UNPOOLED, or DATABASE_URL (local only).
// `pnpm db:migrate:prod` sets MIGRATE_TARGET=production: then only DATABASE_URL_UNPOOLED (Neon's
// direct connection) is accepted. Migrations through the pooler can half-apply; no fallback.
const production = process.env.MIGRATE_TARGET === "production";
const url = production ? process.env.DATABASE_URL_UNPOOLED : process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
// Only migrations need a database; `db:generate` works offline.
const migrating = process.argv.includes("migrate");
if (migrating && !url) {
  throw new Error(
    production
      ? "DATABASE_URL_UNPOOLED is empty. Production migrations need Neon's direct (unpooled) URL; see apps/api/README.md, Going live."
      : "Set DATABASE_URL (or DATABASE_URL_UNPOOLED) to the database to migrate.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/metrics/schema.ts", "./src/auth/schema.ts", "./src/admin/schema.ts"],
  out: "./drizzle",
  dbCredentials: { url: url ?? "" },
});
