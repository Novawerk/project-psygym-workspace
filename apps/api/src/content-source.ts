// Where /cases, /chat and /supervision get cases and rubrics (docs/decisions/0009-admin-phase1.md).
//
// CONTENT_SOURCE=files (the default): the bundled content/, read once at start, as always.
// CONTENT_SOURCE=db: the current published versions. A warm instance never waits for the
// database: past 60 s the copy in memory is refreshed in the background while requests go on
// with it. Only the very first request waits, at most 1.5 s. Fallback: the last copy that
// loaded, then the bundle.
//
// No database code here: the loader is passed in (src/content-db.ts, loaded only with db).
import type { Logger } from "./app.js";
import type { Case, Prompts } from "./content.js";
import { checkCase, checkRubric, type Kind } from "./content-doc.js";

export interface ContentSnapshot {
  cases: Map<string, Case>;
  rubrics: Prompts["rubrics"];
  /** "case:<id>" → published version; empty for the bundle. */
  versions: Map<string, number>;
}

export interface ContentSource {
  /** What a request should use now. */
  current(): Promise<ContentSnapshot>;
  /** The last copy, without waiting: for counting, which is synchronous. */
  latest(): ContentSnapshot;
  /** After a publish on this instance: load again now. */
  refresh(): Promise<void>;
}

export function staticContent(snapshot: ContentSnapshot): ContentSource {
  const now = Promise.resolve(snapshot);
  return { current: () => now, latest: () => snapshot, refresh: async () => {} };
}

export interface PublishedRow {
  kind: Kind;
  id: string;
  version: number;
  source: string;
}

export const CONTENT_TTL_MS = 60_000;
export const FIRST_LOAD_WAIT_MS = 1500;

/**
 * Published rows → a snapshot. Rows that don't pass the checks (they can't get past a publish,
 * but still) are skipped; the item keeps its version from `previous` if it had one. No case at
 * all: null (the import hasn't run), so the caller keeps the bundle. Missing rubrics: the bundle's.
 */
export function snapshotFrom(rows: PublishedRow[], bundle: ContentSnapshot, previous: ContentSnapshot | null, logger: Logger): ContentSnapshot | null {
  const cases = new Map<string, Case>();
  const rubrics = { ...bundle.rubrics };
  const versions = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.kind}:${r.id}`;
    if (r.kind === "case") {
      const c = checkCase(r.id, r.source);
      if (c.value) {
        cases.set(r.id, c.value);
        versions.set(key, r.version);
        continue;
      }
      const prev = previous?.cases.get(r.id);
      if (prev) {
        cases.set(r.id, prev);
        versions.set(key, previous!.versions.get(key)!);
      }
    } else {
      const c = checkRubric(r.id, r.source);
      if (c.value !== undefined) {
        rubrics[r.id as keyof typeof rubrics] = c.value;
        versions.set(key, r.version);
        continue;
      }
      const prevVersion = previous?.versions.get(key);
      if (previous && prevVersion !== undefined) {
        rubrics[r.id as keyof typeof rubrics] = previous.rubrics[r.id as keyof typeof rubrics];
        versions.set(key, prevVersion);
      }
    }
    logger.error({ msg: "content: published version does not parse", kind: r.kind, id: r.id, version: r.version });
  }
  if (cases.size === 0) return null;
  // Sorted by id, like loadCases.
  return { cases: new Map([...cases].sort(([a], [b]) => (a < b ? -1 : 1))), rubrics, versions };
}

export function cachedContent(o: {
  bundle: ContentSnapshot;
  load: () => Promise<PublishedRow[]>;
  logger: Logger;
  now?: () => number;
  keepAlive?: (p: Promise<unknown>) => void;
  ttlMs?: number;
  firstWaitMs?: number;
}): ContentSource {
  const now = o.now ?? Date.now;
  const ttl = o.ttlMs ?? CONTENT_TTL_MS;
  let loaded: ContentSnapshot | null = null;
  /** When the last load started (ok or not): no new one before the TTL is up. */
  let attemptedAt: number | null = null;
  let inflight: Promise<void> | null = null;
  let emptyLogged = false;

  function load(): Promise<void> {
    if (inflight) return inflight;
    attemptedAt = now();
    const started = now();
    inflight = o
      .load()
      .then((rows) => {
        const snap = snapshotFrom(rows, o.bundle, loaded, o.logger);
        if (snap) {
          loaded = snap;
          emptyLogged = false;
        } else if (!emptyLogged) {
          emptyLogged = true;
          o.logger.error({ msg: "content: no published case in the database; using the bundled content" });
        }
      })
      .catch((err) => {
        o.logger.error({ msg: "content: load failed", error: (err as Error)?.constructor?.name ?? typeof err, ms: now() - started });
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  const snapshot = () => loaded ?? o.bundle;

  return {
    async current() {
      if (attemptedAt === null) {
        // The first request of this instance: wait for the database, but not long.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const p = load();
        o.keepAlive?.(p);
        await Promise.race([p, new Promise<void>((r) => (timer = setTimeout(r, o.firstWaitMs ?? FIRST_LOAD_WAIT_MS)))]);
        clearTimeout(timer);
        return snapshot();
      }
      if (!inflight && now() - attemptedAt >= ttl) o.keepAlive?.(load());
      return snapshot();
    },
    latest: snapshot,
    // A load already running may have read the rows before the publish: wait for it, then load again.
    refresh: async () => {
      if (inflight) await inflight;
      await load();
    },
  };
}
