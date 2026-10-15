import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    // Must run before the React plugin. Generates src/routeTree.gen.ts from src/routes/.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // Proxies /api to apps/api on 8790 (`PORT=8790 pnpm --filter api dev`), the way the Vercel
    // rewrite does in production (vercel.json), so the session cookie is same-origin. Not 8787:
    // that port belongs to the Novawerk workspace's dev server on this machine.
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": { target: "http://localhost:8790", rewrite: (path) => path.replace(/^\/api/, "") },
    },
  },
  preview: { port: 4180 },
})
