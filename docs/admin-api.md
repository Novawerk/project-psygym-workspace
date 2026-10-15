# Admin API contract — admin page ↔ backend

The admin page (`apps/admin`, D-A2) calls these routes on our backend (`apps/api`). The app's
contract is [`api-contract.md`](./api-contract.md); nothing here changes it. Decisions and
reasons: [`decisions/0009-admin-phase1.md`](./decisions/0009-admin-phase1.md).

## Basics

- Only with `ADMIN_MODE=on`. Off: every route here is `404 not_found`.
- The page runs on `admin.psygym.novawerk.io`; a Vercel rewrite sends `/api/*` there to
  `psygym-api.novawerk.io/*`. So `/api/admin/me` on the page is `GET /admin/me` here. Local:
  the Vite dev server proxies `/api` the same way.
- JSON in and out, UTF-8. Session: the httpOnly cookie `__Host-psygym_admin`, set by
  `POST /admin/auth/google`. The page never sees the token.
- Every request that changes something (POST, PUT, PATCH, DELETE) needs
  `Origin: <ADMIN_ORIGIN>` and `Content-Type: application/json`, else `403 forbidden`.
- Times are ISO 8601 UTC strings. Days are `YYYY-MM-DD` (UTC).

### Errors

`{"error": {"code": "...", "message": "..."}}`, plus `errors` / `warnings` for content checks.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_request` | bad body or query |
| 401 | `unauthorized` | no session, expired, or the admin was disabled |
| 403 | `not_admin` | sign-in: the Google account isn't an enabled admin |
| 403 | `forbidden` | the role can't do this; or the Origin / Content-Type check failed |
| 404 | `not_found` | unknown route, item, version; or `ADMIN_MODE` off |
| 409 | `conflict` | the draft or the published version changed since the page loaded it; `reason: "draft_outdated"` when the draft started from an older version than the current one |
| 422 | `invalid_content` | publish (or create) refused by the content checks; see `errors` |
| 429 | `rate_limited` | with `Retry-After` |
| 503 | `unavailable` | the database can't be reached |

### Roles

`viewer` reads (dashboard, content, versions, publish log). `editor` and `admin` also write
(drafts, create, preview, publish, roll back). A write as `viewer` is `403 forbidden`.

## Shapes

```ts
type Role = "admin" | "editor" | "viewer";
type Org = "novawerk" | "lingjing";
type Kind = "case" | "rubric";
type Localized = { zh: string; en: string | null };   // en null = missing

type Problem = { path: string; message: string };       // path: "frontmatter.title.zh", "body", "source"

type ContentDoc = {
  source: string;                    // the whole .md file, exactly as stored
  frontmatter: Record<string, unknown> | null;   // parsed; null when the YAML doesn't parse
  body: string;                      // after the frontmatter, comments kept
};

type VersionInfo = {
  version: number;
  action: "import" | "publish" | "rollback";
  fromVersion: number | null;        // rollback only
  publishedAt: string;
  publishedBy: { email: string; role: Role } | null;   // null for the import or a deleted admin
};
```

## Sign-in

### `POST /admin/auth/google` → `200 Me`

Body `{ "idToken": "<Google ID token from Google Identity Services>" }`. Checks in ADR 0009.
Sets the cookie (7 days). `403 not_admin` if the email isn't an enabled admin, or the Google
account (`sub`) isn't the one that first signed in with it; `401 unauthorized` if the token is
bad or expired. `429` after 30 failed sign-ins in 10 minutes, all together (ADR 0009).

### `GET /admin/me` → `200 Me`

```ts
type Me = { email: string; role: Role; org: Org };
```

The page calls it on load: `401` → show the sign-in page.

### `POST /admin/auth/logout` → `204`

Deletes the session and clears the cookie. `204` even without a session.

## Dashboard

### `GET /admin/dashboard` → `200 Dashboard`

Query: `from`, `to` (days, default the last 30 days to today, at most 366 days),
`granularity=day|week` (default `day`), `caseId`, `locale` (`zh`|`en`) — both optional filters.

```ts
type Count = number | "<5";
type Duration = { sessions: Count; avgSec: number | null };   // avgSec null when sessions is "<5"

type Dashboard = {
  from: string; to: string;
  granularity: "day" | "week";
  filters: { caseId: string | null; locale: "zh" | "en" | null };
  minShown: 5;
  periods: string[];                 // every day, or every ISO week's Monday, in the range, in order
  series: Series[];                  // one per metric × dim with any count in the range
  duration: { points: { period: string; value: Duration }[]; total: Duration };  // report lengths
  active: { day: Series; week: Series } | null;   // null with a filter (no case or language there)
  cases: { id: string; title: Localized }[];       // for the filter; current published cases
};

type Series = {
  metric: string;                    // session_started, chat_turn, session_ended_by_client,
                                     // report_generated, report_failed, live_supervision,
                                     // session_duration, feedback, user_report, error, auth,
                                     // (in `active`) active_day, active_week
  dim: string;                       // "" or: turn bucket, duration bucket, up|down, report reason, error code
  points: { period: string; count: Count }[];      // one per period, zeros included
  total: Count;
};
```

- Filter, sum by period, then hide (ADR 0009): never add up `"<5"` cells on the page.
- A week runs Monday to Sunday (UTC) and may be cut by `from` / `to`; `period` is its Monday.
  `active_week` is a count for the whole ISO week (ADR 0008): with `granularity=day` it shows
  on the week's Sunday.
- Metrics and dims are those of ADR 0007. A metric with no count in the range has no series.

## Cases and rubrics

`:kind` is `case` or `rubric`. Rubric ids are schools (`cbt`).

### `GET /admin/content?kind=case|rubric` → `200 { items: Item[] }`

```ts
type Item = {
  kind: Kind; id: string;
  title: Localized;                  // from the published version, else the draft
  publishedVersion: number | null;   // null: draft only, the app doesn't see it
  publishedAt: string | null;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  enMissing: boolean;                // a case field with zh but no en (the app shows zh then)
};
```

Without `kind`: both. Sorted by kind, then id.

### `GET /admin/content/:kind/:id` → `200`

```ts
{
  kind: Kind; id: string;
  published: (ContentDoc & VersionInfo) | null;
  draft: (ContentDoc & {
    revision: number;                // send it back on save, discard and publish
    baseVersion: number | null;      // the published version it started from
    updatedAt: string;
    updatedBy: { email: string; role: Role } | null;
    errors: Problem[];               // what would block publishing
    warnings: Problem[];             // fields that would be left out
  }) | null;
}
```

### `POST /admin/content` → `201` (editor)

Body `{ kind: "case", id, frontmatter, body }` or `{ kind: "case", id, source }`. Creates a
draft for a new case. The id follows `content/README.md` (`^[a-z0-9-]+$`, 3–64 characters) and
never changes; it must match the frontmatter's `id`. `409 conflict` if the id exists (published
or draft). Rubrics can't be created in phase 1 (`400`). Answers like `GET` (with the draft).

### `PUT /admin/content/:kind/:id/draft` → `200` (editor)

Body `{ draftRevision: number | null, rebase?: true, frontmatter, body }` or
`{ draftRevision, rebase?, source }`.

- `draftRevision: null` starts a draft from the published version; a draft that already exists
  makes it `409`. A number must equal the draft's current revision, else `409` (someone saved in
  between: the page reloads and shows both).
- `frontmatter` as JSON is merged into the stored YAML (comments and key order kept).
- `rebase: true` moves the draft's `baseVersion` to the current published version: the editor
  has seen the newer version (see publish).
- Saved even when invalid. Answers like `GET`; the draft's `errors` say what blocks publishing.
- Size limit 200 KB of source.

### `DELETE /admin/content/:kind/:id/draft` → `204` (editor)

Body `{ draftRevision }`; `409` if it changed. Discards the draft. The published version stays.

### `POST /admin/content/:kind/:id/publish` → `200 VersionInfo` (editor)

Body `{ draftRevision: number, basePublishedVersion: number | null }`.

- `409` if the draft's revision changed, or the published version isn't
  `basePublishedVersion` any more (someone published or rolled back in between).
- `409` with `reason: "draft_outdated"` if the draft's `baseVersion` isn't the current version:
  it started before someone else's publish and would overwrite it. Save it again with
  `rebase: true` after looking at the new version.
- `422 invalid_content` with `errors` if the checks fail. Warnings don't block.
- Success: a new version (`current + 1`, `action: "publish"`), the draft is gone, one Slack
  line. The app uses it within about a minute.

### `POST /admin/content/:kind/:id/rollback` → `200 VersionInfo` (editor)

Body `{ toVersion: number, basePublishedVersion: number }`. Publishes a copy of `toVersion` as
`current + 1` (`action: "rollback"`, `fromVersion: toVersion`). `409` if the current version
isn't `basePublishedVersion`; `400` if `toVersion` is the current one or doesn't exist; `422
invalid_content` if that version no longer passes the checks. Publishes directly, no review.
The draft is not touched (it becomes outdated: see publish). One Slack line.

### `GET /admin/content/:kind/:id/versions` → `200 { versions: VersionInfo[] }`

Newest first.

### `GET /admin/content/:kind/:id/versions/:version` → `200 ContentDoc & VersionInfo`

### `GET /admin/publish-log?limit=&cursor=` → `200`

```ts
{ entries: (VersionInfo & { kind: Kind; id: string })[]; nextCursor: string | null }
```

Every import, publish and rollback, newest first. `limit` 1–100, default 50. `cursor` is opaque.

### `POST /admin/content/case/:id/preview-chat` → `text/event-stream` (editor)

Try a case before publishing it. Body:

```ts
{ locale: "zh" | "en"; messages: Message[]; source?: string }
```

`messages` as in `POST /chat`. `source` is the case to play (unsaved edits); without it, the
saved draft, else the published version. `source` at most 200 KB (`400`). `422
invalid_content` if that source doesn't parse as a case. The stream is exactly `/chat`'s (frames, `session_end`, the `END_SESSION_JUDGE` switch).
Not counted, not stored, no Slack. 60 turns an hour per admin. Rubrics have no preview in
phase 1.

## Commands (the lead, with the production env)

| Command | What |
|---|---|
| `pnpm --filter api admin:add --email <e> --role <admin\|editor\|viewer> --org <novawerk\|lingjing>` | add an admin, or change role/org and enable |
| `pnpm --filter api admin:disable --email <e>` | disable, and end their sessions |
| `pnpm --filter api content:import` | switch-over day: `content/` → version 1 (skips items that have versions) |
| `pnpm --filter api content:export` | current versions → `content/`, for a PR |

## Environment

| Variable | |
|---|---|
| `ADMIN_MODE` | `on` turns the admin routes on. Default off. On but a variable below missing: stays off (`404`), one config error in the log. |
| `ADMIN_GOOGLE_CLIENT_ID` | the OAuth client id (not a secret) |
| `ADMIN_ORIGIN` | `https://admin.psygym.novawerk.io` (local: `http://localhost:5173`) |
| `CONTENT_SOURCE` | `db`: the app reads the published versions. Default `files`. |
| `CONTENT_SLACK_WEBHOOK_URL` | Slack incoming webhook for `#project-psygym` (secret). Unset: log only. |
| `DATABASE_URL` | as today |

## Changes

- **implementation (this PR)** — built as written, behind `ADMIN_MODE` (off by default).

- **#105** — first version: sign-in, dashboard, content, preview, commands. Contract only;
  the implementation follows.
