// The current published version of every case and rubric. Loaded only with CONTENT_SOURCE=db,
// and by the admin. See src/content-source.ts.
import { sql } from "drizzle-orm";

import type { Kind } from "./content-doc.js";
import type { PublishedRow } from "./content-source.js";
import type { MetricsDb } from "./metrics/store.js";

export async function loadPublished(db: MetricsDb): Promise<PublishedRow[]> {
  const res = await db.execute<{ kind: string; item_id: string; version: number; source: string }>(sql`
    select distinct on (kind, item_id) kind, item_id, version, source
    from content_versions
    order by kind, item_id, version desc`);
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { kind: string; item_id: string; version: number; source: string }[];
  return rows
    .filter((r) => r.kind === "case" || r.kind === "rubric")
    .map((r) => ({ kind: r.kind as Kind, id: r.item_id, version: Number(r.version), source: r.source }));
}
