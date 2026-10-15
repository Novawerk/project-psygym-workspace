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
    // 8787 is the local API; the admin panel runs beside it and proxies /api to it, the way the
    // Vercel rewrite does in production (vercel.json), so the session cookie is same-origin.
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": { target: "http://localhost:8787", rewrite: (path) => path.replace(/^\/api/, "") },
    },
  },
  preview: { port: 4180 },
})
