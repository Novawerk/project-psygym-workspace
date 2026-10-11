// Static only: `astro build` writes plain HTML to dist/. No adapter, no server, no client JS
// beyond a few lines that pick the language on the bare paths.
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://psygym.novawerk.io",
  output: "static",
  trailingSlash: "ignore",
  build: { format: "directory" },
  vite: {
    plugins: [tailwindcss()],
    // The privacy page reads docs/release/privacy-policy.md from the repo root.
    server: { fs: { allow: ["../.."] } },
  },
});
