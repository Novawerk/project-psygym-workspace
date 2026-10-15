// pnpm --filter api admin:add --email <e> --role admin|editor|viewer --org novawerk|lingjing
// pnpm --filter api admin:disable --email <e>
// No email in the code or the repo: the lead runs these with the production env (ADR 0009).
import { addAdmin, disableAdmin, enabledAdmins } from "../src/admin/index.js";
import { flags, withDb } from "./db.js";

const [command, ...rest] = process.argv.slice(2);
const f = flags(rest);

await withDb(async (db) => {
  if (command === "add") {
    const a = await addAdmin(db, { email: f.email ?? "", role: f.role ?? "", org: f.org ?? "" });
    console.log(`ok: ${a.email} is ${a.role} (${a.org}), enabled`);
  } else if (command === "disable") {
    if (!(await disableAdmin(db, f.email ?? ""))) {
      console.error("no admin with that email");
      process.exitCode = 1;
      return;
    }
    console.log("ok: disabled, sessions ended");
    if ((await enabledAdmins(db)) === 0) console.warn("warning: no enabled admin left");
  } else {
    console.error("usage: admin.ts add --email <e> --role <admin|editor|viewer> --org <novawerk|lingjing> | disable --email <e>");
    process.exitCode = 1;
  }
});
