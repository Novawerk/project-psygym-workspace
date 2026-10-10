// The Vercel Function. vercel.json rewrites every path here. The app comes from our own bundle
// (`pnpm build` → dist/, tsup), so Vercel runs plain JavaScript and never compiles our TypeScript.
import { handle } from "hono/vercel";

import app from "../dist/index.js";

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
export const HEAD = handler;
