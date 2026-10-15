// pnpm --filter api content:import — switch-over day: content/ → version 1 (ADR 0009).
// pnpm --filter api content:export — the current published versions → content/, for a PR.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { importContent } from "../src/admin/index.js";
import { casesWithoutRubric, type Case } from "../src/content.js";
import { checkCase } from "../src/content-doc.js";
import { loadPublished } from "../src/content-db.js";
import { readContentFiles, writeContentFiles } from "../src/content-files.js";
import { withDb } from "./db.js";

const dir = process.env.CONTENT_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../content");
const command = process.argv[2];

await withDb(async (db) => {
  if (command === "import") {
    const files = readContentFiles(dir);
    // Bad files stop importContent below; here only the cross-item rule.
    const cases = new Map<string, Case>();
    for (const f of files) {
      const c = f.kind === "case" ? checkCase(f.id, f.source).value : undefined;
      if (c) cases.set(f.id, c);
    }
    const rubrics = Object.fromEntries(files.filter((f) => f.kind === "rubric").map((f) => [f.id, f.source]));
    const orphans = casesWithoutRubric(cases, rubrics);
    if (orphans.length) throw new Error(`cases without a rubric for their school: ${orphans.join(", ")}`);
    const { imported, skipped } = await importContent(db, files);
    console.log(`imported as v1: ${imported.join(", ") || "none"}`);
    if (skipped.length) console.log(`skipped (already has versions): ${skipped.join(", ")}`);
  } else if (command === "export") {
    const written = writeContentFiles(dir, await loadPublished(db));
    console.log(written.length ? `written:\n${written.join("\n")}` : "content/ is up to date");
  } else {
    console.error("usage: content.ts import | export");
    process.exitCode = 1;
  }
});
