// The Vercel Function. vercel.json rewrites every path here. The app comes from our own bundle
// (`pnpm build` → dist/, tsup), so Vercel runs plain JavaScript and never compiles our TypeScript.
import { handle } from "hono/vercel";

import app from "../dist/index.js";

const handler = handle(app);

// Vercel answers 405 for any method not exported here, before Hono sees the request. Export them
// all, so a new route never needs a change here (test/vercel-entry.test.ts checks).
export const GET = handler;
export const HEAD = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
