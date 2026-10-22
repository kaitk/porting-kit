# Port survey: snowtime at `adcedc7` (2026-10-03)

Run with the porting kit's `port` skill (`skills/port/SKILL.md`), following
`docs/architecture.md`, "The workflow". This is the survey, the fit verdict, and the
requirements questions only. Nothing is implemented, and the user has not agreed any
proposal yet. All paths are relative to the app checkout unless they start with `kit:`.

## 1. Survey by layer

### Stack and versions (from `package.json` and `bun.lock`)

| Package | App (locked) | Kit recipe `versions` | Match |
| ------- | ------------ | --------------------- | ----- |
| `solid-js` | 1.9.15 | 1.9.16 | patch behind |
| `@tanstack/solid-start` | 1.168.57 | 1.168.57 | exact |
| `@tanstack/solid-router` | 1.170.38 | not listed | — |
| `nitro` | 3.0.260903-beta | not listed | — |
| `drizzle-orm` / `drizzle-kit` | 1.0.0-rc.4 (dialect `turso`) | 1.0.0-rc.4 | exact |
| `@libsql/client` | 0.18.0 | not listed (port uses `rusqlite`) | — |
| `better-auth`, `@better-auth/passkey` | 1.7.6 | 1.7.7 | **patch behind, with a known protocol change** (see 2) |
| `valibot` | 1.5.0 | 1.5 | exact |
| `hono` | **not used** | 4.13 | recipe assumes an API the app doesn't have |
| `@inlang/paraglide-js` | 2.25.4 | no recipe | — |
| `@upstash/redis` | ^1.39.0 | no recipe | — |
| `write-excel-file` | 4.1.1 | — | browser only (`src/features/reports/export.ts`) |

### Frontend framework and pages

- SolidJS on TanStack Start (Vite 8, Nitro 3 beta), server-rendered and hydrated, with
  `@tanstack/solid-router-ssr-query` (`src/router.tsx`). Query cache `staleTime` 30 s,
  organization data 5 min (`src/lib/queries/query.ts`).
- 15 route files in `src/routes/`: 13 pages, the `$org` layout, and one API route.
  - Signed-in, under `src/routes/$org/`: `index` (redirect), `timer`, `reports`,
    `projects`, `organization`, `settings`; all but `index` have a `loader` that calls
    server functions.
  - Signed-out or public: `sign-in` (`beforeLoad` + `loader`), `invitation.$id` (`loader`),
    `create-organization`, `index` (redirects), `privacy`, `terms` (static text).
  - `__root.tsx` and `$org.tsx` have `beforeLoad` that reads the session.
- 8 feature folders in `src/features/`; client data access in `src/lib/queries/` (12 files)
  and per-feature `queries.ts`. 37 client files import a `*.functions.ts` module.
- Server entry `src/server-entry.ts` wraps every request: Paraglide's locale middleware
  (per-request locale from the `PARAGLIDE_LOCALE` cookie or `Accept-Language`), a fresh
  CSP nonce per HTML page (`src/server/csp.server.ts`), and the request's cookie passed
  into the render context (`src/lib/cookies.ts`).
- Static files: `public/` is 31 MB, almost all `public/backgrounds/` (168 files). Self-hosted
  docs already put Caddy and optionally Cloudflare in front (`docs/hosting.md`,
  `deploy/self-hosted/Caddyfile`, `deploy/compose/Caddyfile`).

### How the client reaches the server

**Server functions only; there is no JSON API.** 41 `createServerFn` calls in 9 files,
19 GET and 22 POST, 386 lines of thin wrappers over rules in `*.server.ts`:

| File | Functions | GET / POST | Middleware |
| ---- | --------: | ---------- | ---------- |
| `src/server/auth/auth.functions.ts` | 6 | 5 / 1 | none ×5, scope ×1 |
| `src/server/auth/invitations.functions.ts` | 3 | 1 / 2 | scope ×2, session ×1 |
| `src/server/availability/availability.functions.ts` | 1 | 1 / 0 | none |
| `src/server/entries/entries.functions.ts` | 5 | 2 / 3 | scope |
| `src/server/projects/projects.functions.ts` | 8 | 1 / 7 | scope |
| `src/server/reports/reports.functions.ts` | 5 | 5 / 0 | scope |
| `src/server/settings/settings.functions.ts` | 2 | 1 / 1 | session |
| `src/server/teams/teams.functions.ts` | 8 | 2 / 6 | scope |
| `src/server/timer/timer.functions.ts` | 3 | 1 / 2 | scope ×1, session ×2 |
| **Total** | **41** | **19 / 22** | scope 30, session 5, none 6 |

Plus Better Auth's own HTTP routes, `src/routes/api/auth/$.ts` (GET and POST to
`auth.handler`), which the browser calls through `src/lib/auth-client.ts` with the
organization and passkey client plugins: 19 distinct client methods at about 22 call
sites (`signIn.social|email|passkey`, `signOut`, `linkSocial`, `unlinkAccount`,
`listAccounts`, `updateUser`, `passkey.add|list|delete`, `organization.create|update|
checkSlug|setActive|removeMember|updateMemberRole|cancelInvitation`, and `getSession`
through the session query).

Transferability per the kit's three verdicts (kit: `docs/architecture.md`, "Starting
from server functions"):

- **Transferable: 37.** JSON in and out once dates have wire types; logic already in a rule
  shaped `(db, scope|userId, input)`; middleware is session, scope, and rate limit. This
  includes the 30 scoped calls, `getSignInMethods`, `getDeployment`, `getDevUsers`,
  `getInvitation`, `checkAvailability`, `stopTimer`, `getRunningTimer`, and
  `updateSettings`.
- **Transferable with changes: 4.**
  - `getAppSession` (`auth.functions.ts:54`): a GET that writes. It calls
    `auth.api.setActiveOrganization` when the session's organization is missing or stale,
    and sets the `PARAGLIDE_LOCALE` cookie from `user_settings.locale`. Change: return the
    derived organization and locale, and make the repair an idempotent POST (the kit's
    "a GET only reads" rule).
  - `getSettings` (`settings.server.ts:43`): a GET that inserts the first
    `user_settings` row from the browser's time zone and locale. Change: derived default
    plus an idempotent write.
  - `inviteMember` and `acceptInvitation` (`invitations.functions.ts`): they call Better
    Auth's server API with the forwarded request headers and wrap its `APIError` as
    `{ data, error: { code, status } }`; `inviteMember` also applies its own rate limit
    (`invite:<userId>`, 30/min). Change: the native side calls its own auth
    organization code directly; the envelope and Better Auth codes must stay byte-equal.
- **Not transferable as is: 0.** No streams, raw `Response`, `FormData`, or kind-4
  framework-bound calls.

### Serialization

- Start's serializer (seroval) carries `Date` both ways:
  - Outputs: every `timestamp_ms` column comes back as `Date` (time entries' `startedAt`,
    `stoppedAt`; invitations' `expiresAt`; `getAppSession`'s `signedInAt`). The client
    relies on it (`src/features/timer/entries.ts` calls `.getTime()`).
  - Inputs: `Timestamp = v.date()` (`src/server/schemas.ts:29`), used 6 times in
    `entries.schemas.ts` and 2 in `reports.schemas.ts`.
- A custom serialization adapter for `AppError` (code + message key) in `src/start.ts`.
  The error catalogue is `src/server/errors.ts` (69 lines).
- `Map` appears only inside `reports.server.ts`, not on the wire.
- Large responses: the report export is fetched a month at a time, up to about 755 KB per
  piece (`docs/hosting.md`, "Vercel").

### Middleware and cross-cutting server behavior

- `src/server/middleware.ts` (82 lines):
  - `availabilityMiddleware` around every server function: an unexpected error triggers a
    `select 1` probe (3 s), and a failed probe becomes `UNAVAILABLE`, which drives the
    maintenance page.
  - `sessionMiddleware`: Better Auth session check; each POST counts against
    `write:<userId>` (120 per minute, `src/server/limits.server.ts`); the call runs inside
    `withActor` (`src/db/actor.ts`, `AsyncLocalStorage`), which fills `created_by` and
    `updated_by` on every insert and update.
  - `scopeMiddleware`: validates `organizationId` and resolves the scope
    (`src/server/scope.server.ts`), cached per request in a `WeakMap` so one rendered page's
    loaders share one lookup.
- `src/start.ts`: Start's CSRF middleware for server functions.
- CSP with per-page nonce and `strict-dynamic` (`src/server/csp.server.ts`).

### Validation

valibot 1.5.0: 528 lines in 8 schema files (`src/server/*/*.schemas.ts`,
`src/server/schemas.ts`). Custom messages are Paraglide calls evaluated at validation
time, so a refusal's message text depends on the request's locale
(`docs/architecture/platform.md`, "Internationalization").

### ORM and database

- Drizzle 1.0.0-rc.4, relational queries v2 (`db.query.*.findMany({ where: {…} })`) and the
  query builder. Schema: 14 tables in `src/db/schema.ts` (457 lines) and
  `src/db/relations.ts` (86 lines). Booleans as integers, timestamps as `timestamp_ms`,
  UUIDv7 IDs generated on the client for app rows.
- Rules: 20 `*.server.ts` files, 2,707 lines; the largest is
  `src/server/reports/reports.server.ts` (844 lines).
- Driver: `@libsql/client` 0.18.0 (`src/db/connection.ts`). A local `file:` database is
  wrapped so statements queue while a transaction is open (task 043's lost writes).
  Production uses a **remote Turso database**; self-hosted uses a local file
  (`docs/architecture/platform.md`, "Environments and deployment").

### Migrations

20 hand-written SQL migrations in Drizzle 1.0's folder layout,
`drizzle/<yyyyMMddHHmmss>_<name>/migration.sql` (2026-09-24 to 2026-09-30), the source of
truth (`docs/migrations.md`, `drizzle.config.ts`). Scripts: `db-migrate`,
`db-migrate-release` (the release's `snowtime-migrate`), `db-verify` (rejects an edited
applied migration), `db-drift`, `db-seed`, `db-import`. Standalone deployments may set
`MIGRATE_ON_START=true` (`src/env.ts`).

### Auth and its plugins

`src/server/auth/better-auth.server.ts` (115 lines) plus 7 policy files, 653 lines in all:

- Better Auth 1.7.6 with the Drizzle adapter (`provider: 'sqlite'`), `generateId: uuidv7`,
  optional `CLIENT_IP_HEADER`.
- Sessions: 30 days, renewed daily, **`cookieCache` on for 5 minutes**.
- Email and password only in development and demo (`passwordEnabled`); sign-up disabled
  in demo.
- Social: Google, GitHub, Microsoft (optional `MICROSOFT_TENANT_ID`, custom
  `mapProfileToUser` for `emailVerified`) (`sign-in.server.ts`).
- Plugins: `organization` (organization, member, and pending-invitation limits; 48-hour
  invitations; `requireEmailVerificationOnInvitation`; `disableOrganizationDeletion`;
  name and slug hooks), `passkey` (RP ID from `BETTER_AUTH_URL`), and
  `tanstackStartCookies`. No API-key, two-factor, admin, magic-link, or SSO plugins.
- App hooks: login-domain allowlist on user create/update and session
  (`login-policy.server.ts`), refusal of unverified provider sign-ups, name checks
  (`name-checks.server.ts`), an `after` hook that returns `null` from `/get-session` for a
  disallowed domain and stops a removed member's running timer on remove or leave
  (`member-removal.server.ts`).
- Rate limits: Better Auth's limits with custom rules for `/organization/create` (10/h)
  and `/organization/invite-member` (30/min), on a shared store.
- Teams are the app's own tables (`team`, `team_member`) and server functions, not the
  plugin's teams option.

### Rate limiting

`src/server/rate-limit.server.ts`: fixed windows in memory, or Upstash Redis when
configured (needed only on Vercel). Used by Better Auth and by the server-function
middleware.

### Background work, realtime, outbound calls

None. `docs/hosting.md`, "Implications for design": no workers or cron; the running timer
is never written periodically. No server-side `fetch` beyond Better Auth's OAuth token
exchange. No email (task 016 is todo). No websockets or streams.

### i18n

Paraglide JS: English and Estonian, 840 lines each in `messages/en.json` and
`messages/et.json`, compiled into `src/paraglide/` (not committed). The server returns
keys, never display text, except valibot messages (above) and the rendered pages.

### Other things the server does

- `getDevUsers` returns seeded users and their shared password in development and demo.
- Error, not-found, and maintenance pages, with a server-render workaround for loader
  errors (`docs/architecture/platform.md`, "Error and not-found pages").
- Holidays data is static (`src/lib/holidays/`); the weather scene is client-only.

### Deployments, tests, and measurements

- Deployments: Vercel + Turso (production, `vercel.json`, CI-run migrations); one
  self-hosted Linux server with systemd, Caddy, and Litestream (`deploy/self-hosted/`); and
  Docker Compose (`deploy/compose/`). A compiled Bun binary is an option
  (`scripts/build-self-hosted.ts`). Task 075 (self-hosting) is in progress.
- Tests: 25 server and database test files, 3,664 lines (`bun test`), plus component tests
  (`vitest`). No HTTP-level conformance suite exists yet; server tests call rules
  directly.
- Measurements: `perf/` (bundle and query checks, page timings, weather), and task 078's
  load benchmark and usage model (`tasks/078-load-benchmark.md`, status todo), which
  names task 081 as a consumer. Self-hosted numbers in `docs/hosting.md`: ordinary pages
  15–50 ms CPU, the 9-month report 85–92 ms, peak memory near 400 MB, minimum 1 vCPU and
  2 GB.
- Change rate: the history starts 2026-09-24; 514 commits since 2026-09-01, 104 of them
  touching `src/server`, `src/db`, or `drizzle`.

## 2. Fit verdict

| Layer | Verdict | Evidence |
| ----- | ------- | -------- |
| Frontend (Solid + Start, V8 rendering) | **Good** | Start 1.168.57 matches `recipes/frontend/solid-start.md` exactly; Solid is one patch behind. Pages are finite and non-streamed. Gap: loaders call server functions, which the recipe excludes until they move to the API. The adapter must also reproduce `src/server-entry.ts` (Paraglide locale, CSP nonce, cookie context). |
| Client → server (server functions) | **Workable with named gaps** | 41 functions: 37 transferable, 4 with changes, 0 not transferable. The gap is that the middle step (a JSON API in the app beside the server functions) has to be built in the TypeScript app first, and the kit describes it only in prose. |
| Server framework (Hono → Axum) | **Workable, after the middle step** | The Hono recipe applies once that API exists. Until then nothing in the app matches its "When it applies". |
| Serialization | **Workable with named gaps** | `Date` in 8 inputs and many outputs, plus the `AppError` adapter. They need explicit wire types and client revivers. No `Map`, streams, or class instances on the wire. |
| Validation | **Workable with a named gap** | valibot 1.5 matches. Gap: messages are locale-dependent Paraglide calls; the recipe's byte-equal messages assume fixed text. |
| Database (Drizzle → rusqlite) | **Good for a local file; poor for remote Turso** | Drizzle 1.0.0-rc.4 matches exactly; SQLite schema kept. Production runs on remote Turso, which the recipe excludes ("planned, not proven"). The `AsyncLocalStorage` audit actor becomes an explicit parameter in the rules. |
| Migrations | **Good** | 20 Drizzle SQL folders, the format the recipe's migrator applies; `MIGRATE_ON_START` already exists. |
| Auth (Better Auth → owned Rust) | **Workable with named gaps** | The recipe's areas cover everything the app uses: sessions, password, Google, GitHub, and Microsoft, organizations and invitations, passkeys with `preferred`, and the error page. Gaps: (a) the app is on 1.7.6 and the recipe on 1.7.7, and the recipe itself says OAuth stored state changed between them; (b) `cookieCache` is on in the app and off in the recipe's port, a deliberate difference to decide; (c) app policy hooks (login domains, unverified sign-up refusal, name checks, member removal stopping timers, Microsoft `emailVerified` mapping) are port-owned policy. API-key areas in the recipe are unused. |
| Rate limits | **Good** | One process with memory counts, as the recipe's host does; Upstash is a Vercel-only concern. |
| Background work, realtime, outbound SDKs | **Good (none)** | Nothing to port. |
| i18n | **Good for pages, gap for refusals** | Pages render Paraglide inside the bundle; only the server-side validation messages need a decision. |
| Static assets | **Good** | Served from disk behind Caddy or Cloudflare (catalogue, "Static files served from disk"). |

### Overall verdict

- **Kind of port: a second backend.** The app's records say production stays on Vercel and
  Turso and the self-hosted path is the alternative (`docs/hosting.md`, "Self-hosted";
  `docs/architecture/platform.md`). The native server would serve self-hosted
  deployments on the same SQLite file format, with one API and one frontend for both
  backends. To be confirmed (Q1, Q2).
- **Server rendering: yes for parity, as a choice.** Today every page is server-rendered.
  The signed-in pages are SPA-like (query cache, optimistic updates, client-generated
  IDs), so a static frame from Rust would also work for them. The public pages (sign-in,
  invitation, privacy, terms) are small. The kit's proven path is V8 rendering, which
  allows byte comparison against the TypeScript server. Recommendation and alternatives
  in Q6.
- **Worth it: yes, conditionally.** The server's work is auth, validation, and SQLite
  reads and writes, with no SDKs, jobs, or streaming: the kit's best case. Task 078's usage
  model is dominated by API calls: per active user per peak hour, 1 page open against
  about 10 refetch returns and 5 writes. Applying the kit's measured ratios (API 8–11×
  less CPU, pages 1.5–2× less, about 220 MB peak RSS with one renderer against today's
  roughly 400 MB) suggests several times more users per 1 vCPU and 2 GB server. That
  estimate is unmeasured for this app until task 078's baseline exists. Against it:
  - The gain only reaches self-hosted deployments, since production stays on Vercel and
    Turso.
  - The server code changes fast (104 server, database, or migration commits in about 10
    days), and a second backend doubles every contract change.
  - The prerequisite move to a JSON API is itself sizable work in the TypeScript app.

  The port is worth doing if self-hosting on small machines is a real goal and the user
  accepts changing the app first. If self-hosting is occasional or low-load, tuning the
  Bun server (task 075) is cheaper.

## 3. Questions for the user, with recommendations

1. **What is the port for, and how will success be judged?** *Recommend:* self-hosting
   on small servers (1 vCPU / 2 GB) at lower memory and CPU, judged by task 078's load
   model and baseline: users served at the knee, peak RSS, and p95. *Why:* the app's
   records point at self-hosting (task 075, task 078 naming 081), and production stays on
   Vercel.
2. **Second backend or replacement? Does Vercel + Turso stay supported?** *Recommend:* a
   second backend; the TypeScript app stays the production path. *Why:*
   `docs/hosting.md` says production stays on Vercel and Turso, and the kit's replacement
   recipe isn't written.
3. **May the app change first?** The move to a JSON API (37 + 4 functions), the four
   GET-that-writes fixes, and explicit wire types for dates are all changes to the
   TypeScript app. *Recommend:* yes, in the app's own repository as its own task, before
   any Rust. *Why:* the kit's default recipe requires it, and the API with its
   conformance tests is what defines parity. The kit asks before relying on source-app
   changes.
4. **Better Auth version: upgrade the app to 1.7.7 before pinning the port?**
   *Recommend:* yes. *Why:* the auth recipe's reference code matches 1.7.7, and the
   recipe records that OAuth stored state changed between 1.7.6 and 1.7.7. Porting to
   1.7.6 means re-deriving that state format.
5. **Which deployments must the native server support: systemd, Compose, the Bun binary's
   role?** *Recommend:* replace the Bun process in both the systemd and Compose
   self-hosted setups, keep Caddy, Litestream, and Cloudflare, and keep Vercel on
   TypeScript. Remote Turso is out of scope for the native server. *Why:* the kit
   proves only local SQLite, and self-hosting already uses a local file.
6. **Server rendering, a static frame, or the API alone?** *Recommend:* V8 server
   rendering for every page in the first port, because it is proven and byte-comparable.
   Then measure a Rust frame for the signed-in pages as a follow-up if memory matters
   more than first-paint content. *Why:* the kit measured the frame at about tens of MB
   but content 430–480 ms later, and snowtime's own task 079 rejected static shells (per
   the kit's evidence). The user decides the trade.
7. **Memory budget for the server process?** *Recommend:* fit within today's 2 GB minimum
   with headroom for Caddy and Litestream, for example a 1 GiB cap, with renderers sized
   from it. *Why:* the frontend recipe sizes renderers from this number.
8. **Session cookie cache: keep the 5-minute `cookieCache` behavior, or read the session
   row on every check in the native server?** *Recommend:* read every time natively (off),
   recorded as a deliberate difference with its own test. *Why:* the database is local, so
   the read is cheap, and revocation becomes immediate. Keep it on only if both backends
   must answer `get-session` byte-equal from `session_data`.
9. **OAuth providers to keep.** *Recommend:* all three (Google, GitHub, Microsoft with the
   tenant option). *Why:* the app configures all three by environment, and the recipe
   covers exactly these.
10. **Password sign-in and demo mode.** *Recommend:* keep both, with scrypt hashes as
    Better Auth writes them, so demo deployments and seeded users work on either backend.
11. **Locale-dependent validation messages.** Must native refusals match valibot's
    translated messages byte for byte, or is matching the code and key enough?
    *Recommend:* match the code and key, translate messages only where the client shows
    them, and record it as a deliberate difference. *Why:* `docs/architecture/platform.md`
    says only a faulty client reaches server validation.
12. **Which routes first?** *Recommend:* the hot paths in task 078's model: session and
    settings, timer start and stop, entries, and the timer page. Then projects and teams,
    reports, organization and invitations, and the auth areas in the recipe's order
    (sessions first). *Why:* the Hono recipe's choice 1, and that is where the load is.
13. **Deliberate differences allowed?** *Recommend:* yes, each with a decision and a test
    (for example tighter input bounds). Nothing counts as parity unless the comparison
    passes.
14. **Database settings.** *Recommend:* reader pool `auto`, and let either backend apply
    pending migrations at start (`MIGRATE_ON_START`). *Why:* the Drizzle recipe's
    choices; the Compose stack already migrates in the app process.
15. **Where the port lives.** *Recommend:* a separate `snowtime-native` repository with the
    app as a submodule pinned to the commit that has the API. *Why:* the kit's default
    since 2026-10-09; the proof-of-concept layout only fits while the contract changes
    daily, which is a real risk here (see Q16).
16. **Rate of change and maintenance.** Who maintains the native backend, and how do app
    changes reach it? *Recommend:* the port follows selected app releases by moving its
    pin, with the conformance suite in the app gating contract changes. *Why:* the app
    changes daily; a pin per release keeps the second backend's cost bounded.
17. **Budgets for the work.** What time, compute, and external services (OAuth test apps,
    the Hetzner box for calibration) are available, and may sessions use subagents?
    *Recommend:* local Docker runs per task 078, with the Hetzner server only for
    calibration. Subagents only if the user approves them explicitly.

## 4. First proposal per area (provisional until the questions are answered)

| Area | Proposal | Tool | Depends on |
| ---- | -------- | ---- | ---------- |
| Contract | In the app: add a Hono JSON API beside the server functions, one operation per function (method, path, valibot input and output), rules unchanged, client through one module with HTTP and in-process transports; fix the 4 functions listed above; then retire the server functions. Add HTTP conformance tests. | `docs/architecture.md` "The default recipe: move to an API" (no recipe file) | Q3 |
| Wire | Dates as `Date.toJSON` strings decoded by the schemas, with client revivers; `AppError` as an error body `{ code, key }` in a fixed key order. | Architecture, kind 3; catalogue "JSON with dates revived by the schemas" | Q3 |
| Server | Axum with custom extractors (`InOrganization`, `AsUser`, `Public`) that repeat the three middlewares: CSRF/origin, session, scope (cached per request), the 120/min write limit, the actor passed explicitly, and the availability → `UNAVAILABLE` mapping. One module per domain mirroring `src/server/<domain>/`. | `recipes/server/hono.md` | Q11–Q13 |
| Database | `rusqlite` with SQL strings, one writer and readers on WAL, immediate transactions, bounded admission; `created_by`/`updated_by` set from the actor. | `recipes/database/drizzle.md` | Q5, Q14 |
| Migrations | The Drizzle-compatible migrator over `drizzle/`, `MIGRATE_ON_START`, foreign-key checks as the recipe says. | Drizzle recipe | Q14 |
| Auth | Port-owned Rust from the reference hand-port: sessions first, then email sign-in, OAuth for three providers, organizations and invitations (with the app's limits and hooks), passkeys, error page, rate limits. App policy (login domains, unverified refusal, name checks, member removal stops timers, Microsoft `emailVerified`) ported as policy modules. | `recipes/auth/better-auth.md` | Q4, Q8–Q10 |
| Rendering | The app's server bundle in V8 isolates through a port-owned adapter that also applies Paraglide's per-request locale, the CSP nonce, and the cookie context; ASCII-only minify; in-process API calls. | `recipes/frontend/solid-start.md` | Q6, Q7 |
| Static files | Served from disk with a path index, behind Caddy or Cloudflare as today. | Catalogue | — |
| Rate limits | In-process, in the host, one limiter wrapping `/api/auth` and the API. | Auth recipe pitfalls | — |
| Verification | App conformance suite and byte comparison (API, pages, auth flows across backends), hardening checks, migrations on fresh and TS-migrated databases, and a performance gate on task 078's model. | Recipes' "Verify" sections | Q1 |
| Not ported | Remote Turso, Upstash, Vercel deployment: no native recipe; they stay on the TypeScript backend. | — | Q2, Q5 |

## 5. Kit feedback

### What helped

- `skills/port/SKILL.md` is short and routes well: the workflow link, the recipe table
  with status, and the instruction to compare `versions` and carry "Choices for the user"
  into the requirements step gave this survey its skeleton.
- `docs/architecture.md`, "The workflow" step 1 gave a usable checklist of layers to
  survey. "Starting from server functions" gave the four kinds and three verdicts, which
  mapped onto this app's functions directly.
- "Does the app need server rendering" and "Is the port worth it" gave the right
  questions and ratios to quote. The doubt list ("the business logic changes often, and
  the app is to keep two backends") flagged a real risk here.
- Each recipe's front matter (`applies`, `versions`, `status`) let me see in seconds that
  Start and Drizzle match exactly and that Better Auth is a patch behind.
- `recipes/auth/better-auth.md` "When it applies" listed the excluded plugins and
  strategies, so I could rule each in or out quickly. Its "What to expect" paragraph
  surfaced the 1.7.6 → 1.7.7 OAuth state change, the most consequential version finding.
- The catalogue's static-files entry says to ask about a CDN "unless the repository
  already answers it". That was a useful prompt, and the repository did answer it.

### Missing

- **No recipe for the middle step.** For an app on server functions, the biggest piece of
  work is the move to a JSON API. It exists only as prose in `docs/architecture.md`
  ("The default recipe: move to an API"), with no steps, pitfalls, or verify section,
  while `recipes/server/hono.md` "When it applies" explicitly excludes server-function
  apps. The SKILL table row ("server functions first move to an API (architecture)")
  points to prose, not a recipe.
- **No survey output template.** Neither SKILL.md nor architecture.md says what the
  survey document looks like: sections, the transferability table, or how to state
  counts. I built the structure from the brief.
- **No guidance on how to find things.** For example, count `createServerFn(` per file,
  read `createStart` for global middleware and serialization adapters, read the server
  entry for request wrappers, and read `bun.lock` rather than `package.json` for versions
  (`^` and `latest` ranges hide them).
- **Request-scoped implicit state.** The app uses `AsyncLocalStorage` for the audit actor
  (`src/db/actor.ts`) and a per-request scope cache. The kit mentions
  `AsyncLocalStorage` only for the job engine (architecture, "Clean first"), not as
  something the API move or the extractors must turn into explicit parameters.
- **Locale-dependent validation messages.** The Hono recipe assumes valibot messages are
  fixed text ("valibot-compatible validation messages"). Nothing covers messages that
  are i18n calls.
- **Server entry wrappers.** `recipes/frontend/solid-start.md` doesn't mention a custom
  `server-entry.ts` (i18n middleware, CSP nonce, render context), which the adapter or
  host must reproduce.
- **No method for the gain estimate.** "Is the port worth it" gives ratios, but not how to
  combine them with an app's own usage model and measurements. I had to work out to
  weight by task 078's request mix, and still could not produce a number.
- **A remote-database production.** The kit says Turso is later work. It doesn't say how
  to frame a port when production uses it and only one deployment uses a local file. I
  inferred "second backend for self-hosting".

### Unclear or contradictory

- **The kit's evidence is about this same app at a later state.** Architecture says
  "Of Snowtime's 41, 32 were these and 9 needed changes". My independent count at
  `adcedc7` is 41 functions: 37 transferable, 4 with changes. The kit doesn't say what it
  counted as "needed changes" (date inputs? `getDevUsers`?), so I can't reconcile the
  two. This also anchors a survey of Snowtime toward the kit's number.
- **References to files and tasks that postdate this commit.** For example
  `src/lib/api/wire.ts` (architecture, kind 3), tasks 084, 089, and 091, and API keys in
  the auth recipe. Nothing tells a session to expect them only after the middle step.
- **Which Better Auth version the reference code targets.**
  `recipes/auth/better-auth.md` says the reference is tag `native-auth-081.28` and that
  stored OAuth state changed in 1.7.7. It doesn't say whether 081.28 implements 1.7.6 or
  1.7.7 state, which decides Q4.
- **"A journal" in `recipes/database/drizzle.md`.** "When it applies" says "SQL migration
  files with a journal". Drizzle 1.0's folder layout, which this app uses, has no
  `_journal.json`. Step 2 describes folder names, so I read "journal" as the
  `__drizzle_migrations` table, but the wording made me check.
- **Subtask numbers without a namespace.** The catalogue cites "(17)", "(27)", "(01)" and
  sometimes "081.17". It isn't clear these are all snowtime-native subtasks of 081.
- **README.md is stale.** It says "Early: one recipe", but there are four, and its status
  table shows all four layers as 🟡 while SKILL.md calls them "proven".
- **The workflow has different step counts.** Architecture has 3 steps (survey, check,
  propose). SKILL.md has 5 (survey, verdict, requirements, propose, build). README's "How
  a port runs" has 3. They're compatible, but I had to reconcile where the fit verdict
  sits: in step 1 per the architecture, separate per SKILL.md.

### Cost reading time without helping a survey

- `docs/architecture.md`, "Clean first, hybrid only as a tradeoff": about 80 lines on the
  job lane, Bun versus `deno_core`, and server functions served from Rust. This app has no
  candidates for any of it. A one-line pointer to a separate doc would do for a survey.
- `docs/architecture.md`, "Shape" and "What goes in": about 140 lines on how the kit itself
  is built and extracted (crates, task 081's move to its own repository). This is for kit
  maintainers, not a porting session.
- `docs/catalogue.md`: the Tokio lane and auth-spike entries carry history (alpha.3 pin,
  Tina, 32/128 limits) that matters to the build, not the survey.
- `docs/decisions.md` still holds the superseded "Auth goes through better-auth-rs" entry.
  It is marked as replaced, but it is read before the replacement further down.

## 6. Run notes

- **Kit (about 11 files, all read through Bash `cat`/`sed`):** read in full
  `skills/port/SKILL.md`, `docs/architecture.md`, `recipes/README.md`, all four recipes,
  and `docs/catalogue.md`. Read in part `docs/decisions.md` (4 sections and headings),
  `docs/port-repository.md` (first 60 lines and headings), `README.md` (first 60 lines),
  and `AGENTS.md` (first 30 lines). Not read: `docs/development.md`, `tasks/*`,
  `agents/writing.md`, `.claude/skills/google-style/SKILL.md`,
  `skills/port/agents/openai.yaml`.
- **App (about 20 files read in whole or large part, about 60 more grepped):**
  - Read: `AGENTS.md`, `package.json`, `vercel.json`, `drizzle.config.ts`, `src/start.ts`,
    `src/server-entry.ts`, `src/routes/api/auth/$.ts`, `src/server/middleware.ts`,
    `src/server/auth/better-auth.server.ts`, `src/server/auth/auth.functions.ts`,
    `src/server/auth/invitations.functions.ts`, `src/server/reports/reports.functions.ts`,
    `src/db/connection.ts`, `src/db/actor.ts`, `src/env.ts`, `src/server/csp.server.ts`,
    `src/lib/auth-client.ts`, `docs/hosting.md`, `docs/architecture/platform.md`,
    `tasks/README.md`.
  - Read in part: `src/server/auth/sign-in.server.ts`, `src/db/schema.ts`,
    `src/server/rate-limit.server.ts`, `src/server/limits.server.ts`,
    `src/server/settings/settings.server.ts`, `src/server/auth/invitations.server.ts`,
    `src/lib/queries/query.ts`, `tasks/075-self-hosting.md`,
    `tasks/078-load-benchmark.md`, and the heads of tasks 016, 028, and 069.
  - Grepped: the other `*.functions.ts`, schemas, routes, `bun.lock` for resolved
    versions, and `git log` for change rate.
- **Not opened:** any reference code on GitHub (snowtime-native), and nothing outside the
  two input directories. I didn't check out other commits.
- **Unsure whether allowed:**
  - Reading the app's `git log` and `bun.lock`. Both are inside the worktree, and I made no
    checkout, so I treated them as allowed.
  - Creating the `out/` directory for this file.
  - Context my environment attached automatically, not anything I read: the session's
    global instructions and a memory index mention snowtime-native and task 081.40. I
    didn't open the referenced memory files or any snowtime-native files. The survey
    relies only on the two inputs.
