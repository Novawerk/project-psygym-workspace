// content/ ↔ rows, for the content:import and content:export commands (scripts/content.ts).
// Files are read and written as they are, byte for byte: the database keeps the same source.
import fs from "node:fs";
import path from "node:path";

import type { Kind } from "./content-doc.js";

const FOLDER: Record<Kind, string> = { case: "cases", rubric: "rubrics" };

/** Every content/cases/*.md and content/rubrics/*.md, id from the file name. */
export function readContentFiles(dir: string): { kind: Kind; id: string; source: string }[] {
  return (["case", "rubric"] as const).flatMap((kind) =>
    fs
      .readdirSync(path.join(dir, FOLDER[kind]))
      .filter((n) => n.endsWith(".md"))
      .sort()
      .map((n) => ({ kind, id: n.slice(0, -3), source: fs.readFileSync(path.join(dir, FOLDER[kind], n), "utf8") })),
  );
}

/** Writes each item's source; files that are the same already are left alone. The ones written. */
export function writeContentFiles(dir: string, items: { kind: Kind; id: string; source: string }[]): string[] {
  const written: string[] = [];
  for (const it of items) {
    const file = path.join(dir, FOLDER[it.kind], `${it.id}.md`);
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === it.source) continue;
    fs.writeFileSync(file, it.source);
    written.push(path.relative(dir, file));
  }
  return written;
}
