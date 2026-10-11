// Preload for test/cold-start.test.ts: records every module the process resolves, and at exit
// prints the ones from the database packages.
import { registerHooks } from "node:module";

const seen = new Set();
registerHooks({
  resolve(specifier, context, next) {
    const r = next(specifier, context);
    seen.add(r.url);
    return r;
  },
});
process.on("exit", () => {
  const db = [...seen].filter((u) => /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:drizzle-orm|pg|pg-pool|pg-protocol)\//.test(u));
  process.stdout.write(`DB_MODULES ${JSON.stringify(db.length)}\n`);
});
