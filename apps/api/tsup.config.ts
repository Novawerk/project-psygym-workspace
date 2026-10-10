import { cpSync } from "node:fs";
import { defineConfig } from "tsup";

// `pnpm build` → dist/server.js (plain Node: `pnpm start`) and dist/index.js, which
// api/index.js serves as the Vercel Function. npm deps stay external.
// The app reads Markdown at runtime (src/content.ts), so the build copies the prompts and the
// cases next to the bundle: dist/prompts and dist/content/cases.
export default defineConfig({
  entry: ["src/server.ts", "src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  onSuccess: async () => {
    cpSync("prompts", "dist/prompts", { recursive: true });
    cpSync("../../content/cases", "dist/content/cases", { recursive: true });
    cpSync("../../content/rubrics", "dist/content/rubrics", { recursive: true });
  },
});
