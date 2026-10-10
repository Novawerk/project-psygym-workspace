// Run the contract suite against scripts/reference-server.mjs in each mode.
// If this fails, the suite (or the reference server) is wrong, not apps/api.
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const runs = [
  { name: "open (no invite codes)", server: {}, test: {}, script: "test" },
  { name: "invite codes on", server: { INVITE_CODES: "alpha,beta" }, test: { INVITE_CODE: "beta" }, script: "test" },
  { name: "no model", server: { NO_MODEL: "1" }, test: { EXPECT_MODEL_UNAVAILABLE: "1" }, script: "test" },
  { name: "rate limit", server: { RATE_LIMIT: "20" }, test: {}, script: "test:rate-limit" },
];

async function waitForHealth(url) {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`server did not come up: ${url}`);
}

let failed = 0;
for (const [i, run] of runs.entries()) {
  const port = String(8790 + i);
  const server = spawn(process.execPath, ["scripts/reference-server.mjs"], {
    env: { ...process.env, PORT: port, ...run.server },
    stdio: "ignore",
  });
  await waitForHealth(`http://127.0.0.1:${port}/health`);
  console.log(`\n=== ${run.name} ===`);
  const r = spawnSync("pnpm", ["run", run.script], {
    env: { ...process.env, BASE_URL: `http://127.0.0.1:${port}`, ...run.test },
    stdio: "inherit",
  });
  server.kill();
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} run(s) failed` : "\nall runs passed");
process.exit(failed ? 1 : 0);
