# 0009 — Admin, phase 1: Google sign-in, dashboard, cases and rubrics in the database

Date: 2026-10-15. Status: **accepted** (#105); built behind `ADMIN_MODE` and `CONTENT_SOURCE`, both off by default.
The product decisions are in [`product/admin.md`](../product/admin.md) (D-A1–D-A10) and the
phase-1 scope in `product/admin-phase1.md` (product's PR). The HTTP contract is
[`admin-api.md`](../admin-api.md).

**Changes to `admin.md` for phase 1** (agreed with product, 2026-10-15):

- Three roles, not four: `admin`, `editor`, `viewer`. The reviewer role is folded into
  `editor`: an editor saves drafts, previews, publishes and rolls back (D-A9: self-review is
  allowed). No separate "submitted for review" state: a draft, then published.
- No people page and no invite-code page yet. Admins are added and disabled by a command.
- A rollback publishes directly: no review step, like a publish (D-A9). It is logged and
  announced like one.
- No GitHub sync yet (D-A8 is phase 2). After each publish we export by hand
  (`content:export`) and open a PR, so the public repo and the bundled fallback keep up. The CI
  lock on `content/` comes with the sync in phase 2.

## Switches and cold start

Two switches, both off by default. Off means: the same answers, the same modules loaded,
`test/cold-start.test.ts` checks it.

| Switch | Needs | On | Off |
|---|---|---|---|
| `ADMIN_MODE=on` | `DATABASE_URL`, `ADMIN_GOOGLE_CLIENT_ID`, `ADMIN_ORIGIN` | the routes in `admin-api.md` exist | they are `404 not_found`, as today; `GET /admin/stats` (Bearer) and `POST /admin/accounts/delete` don't change either way |
| `CONTENT_SOURCE=db` | `DATABASE_URL` | `/cases`, `/chat`, `/supervision` (and `/feedback`, `/report`, counting) read the current published version from the database | the bundled `content/`, read once at start, as today |

- **The admin module is loaded on the first `/admin/*` request that needs it**, with a dynamic
  import, even with `ADMIN_MODE=on`. A cold start that serves the app never loads it, nor
  `jose` (Google token checks). App routes don't get slower with admin on.
- `CONTENT_SOURCE=db` loads the database code at start, as counting and sign-in already do in
  production (`METRICS_ENABLED`, `AUTH_MODE`). It adds no wait on a warm instance (below).
- `ADMIN_MODE=on` with `DATABASE_URL`, `ADMIN_GOOGLE_CLIENT_ID` or `ADMIN_ORIGIN` missing fails
  closed: the admin stays off (its routes are `404`), one config error in the log, and the rest of
  the service runs as usual. It never takes the server down.
- The two switches are independent. We turn `ADMIN_MODE` on first, import, check the content in
  the admin, then turn `CONTENT_SOURCE=db` on.

## Sign-in (Google only, D-A3)

Same approach as Novawerk's admin (`Novawerk/novawerk-workspace`, `apps/api/src/auth.ts`),
rewritten here:

1. The admin page shows the Google button (Google Identity Services). Google gives the page an
   ID token.
2. `POST /admin/auth/google { idToken }`. We check it with `jose` against Google's public keys
   (`https://www.googleapis.com/oauth2/v3/certs`, cached by `jose`): RS256, issuer
   `accounts.google.com` or `https://accounts.google.com`, audience = `ADMIN_GOOGLE_CLIENT_ID`,
   not expired, `email_verified: true`.
3. The email (lower-case) must be an enabled row in `admins`. Otherwise `403 not_admin`, the
   same answer for "not in the table" and "disabled". On the first sign-in we store the token's
   `sub` (Google's account id) in `admins.google_sub`; from then on the `sub` must match too, so a
   Google account that later takes over the same address can't get in. We don't check `hd`:
   聆镜's colleagues use personal Google accounts, not a Workspace domain.
4. We create a session: 32 random bytes, base64url, in an httpOnly cookie `__Host-psygym_admin`
   (Secure, SameSite=Lax, Path `/`, no Domain, 7 days; browsers accept Secure cookies on
   `http://localhost` too). The database keeps only the sha256 of the token. A session cookie the
   browser still sent with the sign-in is deleted, and so are expired sessions.
5. **Every request** looks the session up together with its admin row (one query): expired
   session, disabled admin or unknown token → `401`. Disabling an admin works on their next
   request; it also deletes their sessions. A role change applies on the next request.

**Same origin.** The admin page runs on `admin.psygym.novawerk.io` and a Vercel rewrite there
sends `/api/*` to `psygym-api.novawerk.io`. The browser sees one origin: the cookie is
first-party, and the API needs no CORS with credentials (the app's CORS stays `*`, unchanged).

**CSRF.** SameSite=Lax stops other sites, not other `*.novawerk.io` subdomains (same site). So
every `/admin/*` request that changes something (not GET/HEAD) must carry
`Origin: <ADMIN_ORIGIN>` exactly and a JSON body (`Content-Type: application/json`); otherwise
`403 forbidden`. The Bearer routes (`/admin/stats`, `/admin/accounts/delete`) don't use the
cookie and are not affected.

**Limits.** Behind the Vercel rewrite the address we see may be Vercel's, not the visitor's, and
keying a limit by IP would also mean storing an IP or a hash of one (an unsalted hash of an IPv4
address can be reversed). So the sign-in limit doesn't use the IP: one counter in the database
(`rate_counters`, the table from 0001, key `admin-sign-in-failures`), shared by all instances,
counts failed sign-ins (bad token, `not_admin`). Past 30 in 10 minutes, every sign-in is `429`
until the window ends. The cost: someone sending junk tokens can keep us out for 10 minutes at a
time; sessions already open keep working. A valid sign-in is cheap to check (Google's keys are
cached), so this only stops floods. Preview chat: 60 turns an hour per admin, in memory per
instance (it only guards model spend).

**Login log.** `admin_logins(admin_id, at)`; rows older than 90 days are deleted on each new
login (`admin.md` §5). `admins.last_login_at` is updated too. No IP, no user agent.

### What the user does in Google Cloud (once)

1. In Google Cloud Console, pick a project (Novawerk's is fine) → **APIs & Services → OAuth
   consent screen**: user type **External**, app name「聆镜 PSYGYM 后台」, support email, the
   scopes `openid`, `email`, `profile` only (no sensitive scopes, so no Google review), then
   **Publish app** (in "Testing", only listed test users can sign in).
2. **Credentials → Create credentials → OAuth client ID**, type **Web application**, name
   `psygym-admin`. **Authorized JavaScript origins**: `https://admin.psygym.novawerk.io` and
   `http://localhost:5180` (local admin). No redirect URI is needed (the button gives the token
   to the page).
3. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`; it is not a secret) and
   give it to the lead. It goes into `ADMIN_GOOGLE_CLIENT_ID` on `psygym-api` and into the admin
   page's build config. There is no client secret to handle: we only verify ID tokens.

## Storage (Drizzle, the same Neon database; migration `0002_admin`)

| Table | Columns | Notes |
|---|---|---|
| `admins` | `id` (uuid), `email` (lower-case, unique), `google_sub` (set on first sign-in), `role` (`admin`/`editor`/`viewer`), `org` (`novawerk`/`lingjing`), `enabled`, `created_at`, `last_login_at` | Our own members' data. |
| `admin_sessions` | `token_hash` (sha256, pk), `admin_id` (fk, cascade), `created_at`, `expires_at` | Expired rows are deleted on the next login. |
| `admin_logins` | `id`, `admin_id` (fk, cascade), `at` | 90 days. |
| `content_versions` | `kind` (`case`/`rubric`), `item_id`, `version`, `source`, `action` (`import`/`publish`/`rollback`), `from_version` (rollback only), `note` ("what changed", ≤ 200 characters, optional), `published_by` (fk, set null), `published_at` | pk (`kind`, `item_id`, `version`). Only published versions; never updated, never deleted. This table *is* the publish log. |
| `content_drafts` | `kind`, `item_id` (pk together), `source`, `revision`, `base_version`, `updated_by`, `updated_at` | At most one draft per item, shared by all editors. `revision` comes from one sequence (`content_draft_revisions`): a number is never used twice, so a page holding an old draft's revision can't save over or publish a newer draft (review of #108). |

The migration only adds tables; it changes nothing that exists. Order: migrate first, then
deploy (the new code expects the tables only when `ADMIN_MODE` or `CONTENT_SOURCE=db` is on).

**We store the whole file, `source`**: the Markdown exactly as in `content/` (YAML frontmatter
and body, comments included). The frontmatter of `placeholder-cbt-depression` has YAML comments
and the bodies have `<!-- -->` notes for 聆镜; a JSON round trip would lose them. So the export
writes `source` back byte for byte, and the database and `content/` can be compared with `diff`.
The API also gives the parsed frontmatter as JSON for the form. When the page sends the
frontmatter as JSON, we merge it into the stored YAML document (`yaml`'s document API), which
keeps comments and key order for the keys that didn't change.

**Versions.** The current version of an item is its highest version. Publishing a draft inserts
`version = current + 1` and deletes the draft, in one transaction; the primary key turns a race
between two publishes into `409`.

**An outdated draft can't overwrite a newer publish.** A draft remembers the version it started
from (`base_version`). If someone publishes or rolls back after the draft was started, the
draft's `base_version` is no longer the current version and publishing it is `409` (reason
`draft_outdated`), even if the page sent the right `basePublishedVersion`. The editor looks at
the new version, merges what they need by hand, and saves the draft with `rebase: true`: that
moves `base_version` to the current version (an explicit "I have seen it"). Then publishing
works. A rollback inserts `version = current + 1` with the old
`source`, `action = rollback`, `from_version`; the draft stays. Nothing is ever overwritten, so
the version list is the publish log (who, when, what, from which version).

**Checks.** A draft may be saved while invalid (the answer lists the problems). Publishing and
rolling back run the same checks, and refuse with `422`. The checks are one set of functions
(`src/content-doc.ts`) that the loader of `content/`, the import, publish, rollback and the tests
all call; the rubric rules move there out of `test/content.test.ts`.

- case: `parseCase` (required fields, `id` = the path's id, ids `^[a-z0-9-]+$`, closed `<!-- -->`);
  optional-field warnings are listed but don't block, as at load time;
- rubric: the path's id is a known school (`cbt`), frontmatter `id` and `school` match it,
  comments closed, skill ids present, unique and including `risk_screening`;
- across items: every case's school has a rubric. The loader and the import check the whole
  set; publishing a case checks that its school has a rubric (published, or bundled).

## How the app reads the published version (`CONTENT_SOURCE=db`)

- One query: the highest version of each item (`distinct on (kind, item_id)`), parsed into the
  same `Case` map and rubric map the app uses today.
- **Cache: 1 minute, never in the request's way on a warm instance.** After the first load, a
  request uses what's in memory; if it is older than 60 s, a refresh starts in the background
  (one at a time, kept alive with `waitUntil`) and the request goes on with the copy it has. A
  publish reaches every warm instance within about a minute.
- **Cold start:** the first request waits for the first load, at most 1.5 s. A Neon database that
  was asleep can take that long to wake, so a cold start with `CONTENT_SOURCE=db` may be up to
  1.5 s slower than today, once per instance. If the load doesn't finish in time, the request
  uses the bundle and the load goes on in the background; the next request uses its result, or
  starts a new load if it failed.
- **Fallback, in this order:** the last copy that loaded → the bundled `content/`. A failed or
  slow load is one log line (the error's kind only) and the request goes on. If the database has
  no published case at all (import not run), we use the bundle and log it. A rubric missing for
  a school falls back to the bundled one. A published version that doesn't parse (it can't get
  past the publish check, but still) is skipped and the item keeps its last good version.
- **Mid-session:** each turn reads the version current at that moment (stateless, as
  `admin.md` §2 accepts).
- The `turn` log line gets the case's version (`caseVersion`). Counting by case id is unchanged.

**Switch-over day**, in this order:

1. Merge or close every open PR that touches `content/cases/` or `content/rubrics/`.
2. Migrate (`0002_admin`), then deploy.
3. `admin:add` the first admin; set `ADMIN_MODE=on`.
4. `content:import` (below); look at the cases and the rubric in the admin.
5. Set `CONTENT_SOURCE=db`.
6. Same day: `content/README.md` and `docs/for-psygym-team.md` say that cases and rubrics are now
   edited in the admin, and that a PR to `content/` no longer reaches the app (until the sync in
   phase 2 turns the folder into an exported copy).

**Import.** `pnpm --filter api content:import` (the lead runs it right after
the migration, like the migration itself) inserts every `content/cases/*.md` and
`content/rubrics/*.md` as version 1, `action = import`, no publisher. Each file goes through the
publish checks; a bad file stops the import before anything is written. An item that already has
versions is left alone, so running it twice is harmless. Until it has run, the app keeps
serving the bundle (above).

**Export.** `pnpm --filter api content:export` writes each item's current `source` to
`content/<kind>s/<id>.md` (unchanged files are left untouched), for a PR. Phase 2 replaces
this with the bot (D-A8).

## Publish notice (Slack #project-psygym, D-A9)

Every publish and rollback posts one line to `CONTENT_SLACK_WEBHOOK_URL`: kind, id, version,
action, the publisher's role. No name, no email, no content. Examples:
「病例 cbt-depression-anxiety-01 发布了 v3（编辑）」,「督导标准 cbt 回滚到 v2，生成 v4（管理员）」.
Best effort: a Slack failure is one log line and the publish stands. Unset: log only. The
import posts nothing.

**Setting up the webhook (the user, once):** Slack → *Tools & settings → Manage apps* → the
app we use for `#psygym-feedback` (or a new app "PSYGYM 后台") → **Incoming Webhooks → Add New
Webhook** → channel `#project-psygym` → copy the URL (`https://hooks.slack.com/services/…`) →
the lead sets it as `CONTENT_SLACK_WEBHOOK_URL` on `psygym-api` by clipboard. It is a secret:
never in a file or a message.

## Dashboard

`GET /admin/stats` (Bearer `ADMIN_STATS_TOKEN`) stays exactly as it is: the lead's scripts use
it. The admin page uses a new route, `GET /admin/dashboard`, behind the cookie: any role. Same
table (`daily_counts`), filtered by case and language and summed by day or ISO week (Monday to
Sunday, UTC) **in the backend**. Hiding happens after filtering and summing, on what is sent:

- every count under 5 shows `"<5"`, and so does every total under 5;
- per metric, the counts form a table, periods × dim. In every row and every column with exactly
  one hidden cell among the non-zero ones, the smallest shown cell is hidden too; we repeat
  until nothing changes. So no hidden cell is a total minus the rest;
- a metric's dims and the metric's total per period are one table: the total is a column of
  it, so hiding a bucket can't be undone by subtracting the other buckets from the total. For
  `session_duration` that total column is the number of sessions with a duration, shown in
  `duration`; its average is hidden with it;
- `active_day` / `active_week` have no case or language: with a filter they are `null`.

As in ADR 0007, this protects one response. Subtracting two responses with different
filters or ranges can still reveal a hidden cell; only admins see the dashboard.

## Roles

| | viewer | editor | admin |
|---|---|---|---|
| dashboard, read cases and rubrics, versions, publish log | ✓ | ✓ | ✓ |
| save / discard drafts, create cases, preview chat, publish, roll back | | ✓ | ✓ |
| manage admins | command only (phase 1) | | |

`admin` and `editor` can do the same in the API in phase 1; `admin` is there for phase 2
(people and invite codes). 聆镜's psychologists are `editor`.

**Adding admins** (the lead, with the production env, like the migration):

```bash
pnpm --filter api admin:add --email <email> --role admin --org novawerk
pnpm --filter api admin:disable --email <email>
```

`admin:add` creates the admin, or updates the role and org and enables an existing one. No email
is in the code, a migration or the repo.

## Privacy

- New personal data: our own members' emails, roles, login times (90 days) and who published
  what. All in the same Neon database (Frankfurt).
- The logs carry admin ids, never emails, ID tokens or cookies.
- The preview chat is like `/chat`: the conversation goes to the model and nowhere else; it is
  not counted and not stored.
- `docs/release/privacy-policy.md` is about app users; the admin data isn't about them. Product
  checks whether the policy's "who we store data about" needs a line.

## Not in phase 1

Invite codes in the database, a people page, GitHub sync and the CI lock on `content/`,
taking a case down, the reviewer state, email-code login for the admin (if 聆镜 can't reach
Google, `admin.md` §4).
