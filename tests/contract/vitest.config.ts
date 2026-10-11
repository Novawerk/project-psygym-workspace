import { defineConfig } from "vitest/config";

// Vite sets BASE_URL to "/" inside test workers. Hand ours over under another name.
// No default: see src/env.ts. (Assigning undefined to process.env would store "undefined".)
if (process.env.BASE_URL && !process.env.CONTRACT_BASE_URL) process.env.CONTRACT_BASE_URL = process.env.BASE_URL;

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // One server, one rate limiter: run files and tests one at a time.
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
