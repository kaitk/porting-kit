# Architecture

How the kit works now: what it is for, its shape, the workflow a porting session follows,
and what goes in. Why each part came to be this way is in [decisions](decisions.md); the
decisions a port reuses are in the [catalogue](catalogue.md). Task numbers such as 081.22
or 084 refer to snowtime's and snowtime-native's task records;
[the port repository](port-repository.md) says where they live. Bare subtask numbers
such as (17) are snowtime-native's subtasks of task 081.

A survey needs the workflow, "Starting from server functions", the kinds of port,
rendering, and whether the port is worth it. "Shape", "Layers", and "What goes in"
describe the kit itself.

## Goal

The kit helps an explicitly invited agent understand an app, establish the user's
requirements, and deliver a well-founded port that its own repository can keep working
well. Recipes, measured decisions, crates, and codemods support that outcome. A successful
initial build is part of it; maintainable architecture, useful documentation, reproducible
checks, and a way to handle later changes are also deliverables.

The first supported direction is a TypeScript cloud app to a Rust server with local
SQLite, starting with Snowtime's stack: SolidJS, TanStack Start, Drizzle, and Better Auth.
Turso and other frameworks or databases are later work. The survey establishes how much
of the kit fits each app; the kit does not claim a recipe for an untested stack.

The stretch goal (2026-10-05) is that, where an app's stack matches closely enough,
a session ports an app of Snowtime's size from its server functions in one run, with the
kit's crates, patterns, and codemods. The kit aims at that goal but isn't bounded by it: a
better designed, more capable kit is worth a few more runs. The kit is also honest about
when a port isn't worth doing.

## Shape

The kit works like a project template that agents run (2026-10-08), with the lifecycle
clarified on 2026-10-22:

- The user starts the port skill explicitly. It surveys suitability, asks about the
  requirements the code cannot establish, proposes options, and implements the agreed
  scope. A survey request alone does not authorize a port.
- The generated repository belongs to its owner. It may follow the original, take only
  selected changes, replace it, change architecture, retain some TypeScript, drop
  features, or be discontinued. Later porting starts from that repository's current
  decisions. A kit update does not reset them.
- Its crates are opinionated and fast, but general enough for a broader range of
  projects. Each one is optional and plugs in alone, such as the in-process edge in place
  of a reverse proxy, or the rate limits. Code shaped by one app is template code that
  the generated project owns, not a crate.
- The port keeps the setup, source references, coverage, decisions, experiments, tests,
  and operating instructions needed to maintain it independently. Its source-app pin
  records a baseline; its coverage record explains omissions, later selected changes,
  and deliberate differences. See [the port repository](port-repository.md).
- Updating the original-app baseline and adopting kit changes are separate choices.
  The port need not stay synchronized with the kit. It may reuse newer recipes or update
  individual kit dependencies when useful, through its own review and verification.
  The kit suggests source-app changes that make the port easier and asks the user before
  relying on them; access to both repositories does not authorize changing both.
- A separate repository is the main pattern, not the only one. A proof of concept can
  start in the original repository, which usually needs TypeScript changes too: a minimal
  port of the critical paths to Rust, with the rest run through V8 if needed, as task 081
  began. Running unported API routes, not only rendering, needs a database path for
  them; the proof-of-concept recipe decides between host operations for V8 and a proxy
  to the original server.
- Task 081 moves to its own repository, `snowtime-native`, after the port is feature
  complete and audited: split it first, then extract the kit's crates into the kit's
  repository with `snowtime-native` as their first consumer. It pins the `snowtime`
  commit it matches, and that commit's conformance suite and byte comparison define the
  match. Once the kit exists, regenerating `snowtime-native` from it measures the kit
  against the hand-built port. A second, different app tests that the crates are general.
- A manually invoked index skill ([`skills/port`](../skills/port/SKILL.md)) routes a
  session to recipes by layer: frontend framework, server framework, ORM, auth, and
  database. Recipes are
  Markdown in [`recipes/`](../recipes/README.md), one per library under its layer, and
  only the index is a skill (2026-10-11).
- Each recipe says when it applies, its steps, its pitfalls, and how to verify the
  result.
- Each recipe and crate has the date it was checked and the library versions, so a
  session can tell when to check again.
- A stack nobody has ported yet is marked as not written, not filled with guesses.

### Layers that swap independently

The kit works layer by layer (2026-10-05), so swapping one layer of the stack leaves
the rest usable. An app on SvelteKit with the same Drizzle, Better Auth, and SQLite should
reuse every backend recipe and crate, and the survey should name exactly what is missing
for SvelteKit, rather than fail or guess. Those recipes don't have to exist yet; the
layering does.

- The crates know nothing about the frontend framework. The rules, extractors, SQL
  helpers, migrator, auth, and edge depend only on the API contract and the database.
- What a framework changes sits in an adapter with a small, documented interface:
  - the render bundle's entry, which renders a URL into a head and HTML chunks
    (`renderPage` today, from Solid and Start);
  - the client transport, which the frontend's data layer calls;
  - the client manifest and asset layout the host serves;
  - how the framework's server calls (Start's server functions, SvelteKit's load
    functions, form actions, and remote functions) map to the API.
- The render host (the isolate pool, host functions, and memory policy) takes any bundle
  that implements that entry.

## The workflow

A port starts with four steps (2026-10-03; questions first and a short survey since
2026-10-22). The session checks its findings with the user before proposing the
implementation. The purpose is to establish what a good port means for this project,
including whether to proceed at all.

1. **Ask first.** Before surveying, the session asks the few questions whose answers
   change what is worth surveying, each with the answer it recommends from a quick look at
   the app and its records: what the port is for and how success is judged; whether the
   source app stays as a supported backend or the port replaces it; which features and
   deployments must keep working; which calls are hot, and whether usage data or a load
   model shows it, or whether a TypeScript tail is acceptable; and whether the source app
   may change first. Three to five questions; the rest wait for step 3. Without a user to
   answer, as in a replay, the session writes them down and continues on its
   recommendations.
2. **Survey.** The session reads the app and lists what needs porting, by layer: frontend
   and server framework, how the client reaches the server (server functions, an API, or
   both), serialization, middleware, ORM and database, migrations, auth and its plugins,
   background work, i18n, shared code the server runs (date and time-zone logic, for
   example), and anything else the server runs. Each item names where the app uses it and
   how much: for example 41 server functions in 9 files. It ends with the fit verdict per
   layer, the kind of port, whether server rendering is needed, and whether the port is
   worth it.

   Keep the survey short: tables and counts, about 150 to 200 lines, with details only
   where they change a verdict or a question; the user asks for more where they need it.
   Its length is most of a survey's time.

   Where to look in a Start app: `createServerFn(` per file; `src/start.ts` or
   `createStart` for global middleware and serialization adapters; the server entry for
   request wrappers such as i18n, a CSP nonce, or render context; `AsyncLocalStorage` for
   request-scoped state; i18n calls in server modules and schema messages
   ([i18n](i18n.md)); lax input coercion, such as dates revived with `new Date(text)`,
   which accepts forms the engine chooses; and the lockfile, not `package.json`, for
   versions.
3. **Check with the user.** The session presents the survey and the remaining questions,
   each with a recommended answer, including each applicable recipe's "Choices for the
   user". The user confirms the list, corrects it, and adds what code can't show.
4. **Propose.** Only then does the session propose a port for each item, from the
   recipes, or marks the item as having no recipe yet.

### Establish the requirements

Read the app's own records before asking for facts they hold, and tell a current
decision from an abandoned experiment. The fit verdict is good, workable with named gaps,
or poor, per layer with its evidence; whether the port is worthwhile is a separate call.

The questions that shape the design:

- The purpose of the port: hosting cost, resource limits, deployment options, ownership,
  maintainability, or another concrete need; how success will be judged.
- Required features and deployments, deliberate omissions, and whether the source app
  remains a supported alternative or the port replaces it.
- Required compatibility: API and error behavior, database and migrations, existing
  accounts and sessions, clients, page behavior, and any in-flight protocols at cutover.
- Target language and framework constraints, acceptable dependencies and runtime costs,
  rendering needs, and whether a TypeScript fallback is acceptable for particular work.
- Expected usage and resource budgets, available measurements, and the limits on time,
  compute, and external services for implementation and validation.
- The intended maintenance workflow: selected upstream features, independent development,
  dependency updates, deployment, and who will operate the result.

Record the agreed scope, open questions, and acceptance checks in the port, and bring a
change to them back to the user.

### Choose the implementation tools

Per area: a tested library, a kit crate, a recipe, a generator, port-owned code, or an
agreed hybrid. A Rust library existing doesn't mean it does what the app's TypeScript
library does: snowtime-native compared better-auth-rs flow by flow and kept its own auth
code (tasks 081.39, 081.40, and 081.42). A generated file records its inputs and command.
Subagents run only with the user's explicit approval, and the workflow works without them.

### Implement, verify, and hand over

Shared behavior passes the source app's conformance and comparison checks. A deliberate
difference has a decision and its own tests, and is never counted as parity. Include
migrations, refusal and cancellation, and end-to-end flows, since the 081.30 audit found
faults the per-route comparison missed. A performance claim names its workload,
environment, and commits.

Before handover, check a clean-checkout build and the documented commands. Evidence for a
decision lives in the port, not only in a scratch directory.

### Continue from the port's own state

Later work starts from the port's records and follows
[maintaining the port](port-repository.md#maintaining-the-port); it needs neither the kit
nor the first conversation.

## Starting from server functions

An app whose client calls server functions, as Snowtime does, is a supported starting
point. Server functions come in four kinds, which the survey counts:

1. **Calls:** input in, JSON out. Mechanical to move, though some need changes, such as
   a cookie, the request's headers, a GET that writes, or an answer with internal columns.
2. **HTTP semantics:** cookies, redirects, files, or streams. These map onto HTTP, with
   care.
3. **Rich serialization:** `Date`, `Map`, promises, or streams in Start's serializer
   (seroval). These need explicit wire types and revivers, as `src/lib/api/wire.ts` has.
4. **Bound to the framework:** React Server Components, server actions with arguments
   captured in closures, functions that return JSX or rely on forms working without
   JavaScript. These don't map to an API without redesigning the feature.

### The default recipe: move to an API

A Rust server can serve Start's server functions only by following Start's private,
unversioned protocol (task 081.02), so the default port goes through a middle step in the
TypeScript app: a JSON API beside the server functions, which then go. The
[server functions recipe](../recipes/server/server-functions.md) has the steps. Keeping
both was rejected: two wire formats drift, every test runs twice, and the API costs no
more CPU (snowtime task 084).

The survey checks that each server function can move, and reports one of three verdicts
for each, counted from the app's own code. Check outputs as well as inputs.

- **Transferable:** its input and output are JSON, with dates decoded by the schemas; its
  logic is in a rule or can move into one; its middleware is a check the API can repeat
  (session, scope, rate limit).
- **Transferable with changes:** for example, it returns a `Map`, a class instance, or
  internal columns; it sets cookies or redirects; it reads the request inside its logic.
  The report says what to change.
- **Not transferable as is:** for example, it streams, returns a raw `Response`, or takes
  `FormData`. The report says why and suggests another way, which the user decides on.

The user reviews the report as part of step 2.

### Clean first, hybrid only as a tradeoff

The kit prefers a clean design: every call ported natively, behind one API. A hybrid,
where some code keeps running as TypeScript, is a tradeoff the session proposes only when
the clean design isn't straightforward, and it says what the hybrid costs and how the app
would leave it later (2026-10-05).

This is a starting recommendation for the agreed scope. The user may choose a hybrid
as the maintained design; retaining an infrequent feature in TypeScript does not create
an obligation to rewrite it later. Record why it stays, its runtime and resource costs,
and what evidence would justify changing that choice.

Usage and profiles decide where the line goes, not guesses: the app's access logs or
analytics show which calls are used and how often, and a profile under the load model
shows where the CPU goes (task 081.12). The hot, central calls are ported natively. A long
tail of rarely used calls can be left behind.

These hybrids are sketched in [hybrids](hybrids.md): the core ported with the long tail as
TypeScript jobs, server functions served from Rust, and kind 4, which has no Rust path.

## Kinds of port

The survey decides which of these the port is, since each changes the recipe:

- **A second backend:** the TypeScript app keeps running, for example on Vercel, and the
  native backend serves self-hosting. Both serve one API, the conformance suite runs
  against both for as long as both exist, and contract changes land on both sides. This
  is task 081's case.
- **A replacement:** the native backend takes over and the TypeScript backend goes. The
  conformance tests and byte comparison are the acceptance check at cutover, not a
  standing constraint. After cutover the contract can change freely, and the TypeScript
  server tests are ported to Rust or retired. The recipe adds cutover, data, and rollback.
  Not written yet.

When production runs on a remote database such as Turso, which the kit doesn't cover
(the database recipe is for a local file), the port is a second backend for the
deployments that can use a local file, and production stays on the TypeScript app.

Either kind can cover an agreed subset and can change direction later. A port that stops
following the original keeps the provenance and tests it still needs; it does not have
to retain an unused frontend, source checkout, or comparison suite forever. Record the
decision and replace any removed verification on which continued correctness depends.

## Does the app need server rendering

The survey answers this with the user, and is honest about what each choice costs.

- **Server rendering in the V8 isolate**, as task 081 does. Content arrives with the
  first response, and the client hydrates it. The costs: with one renderer the server
  peaked at 219 MB RSS under load, each further renderer adds about 50 MiB idle (the host
  plans 80 MiB), and a page costs only 1.5–2× less CPU than on the TypeScript server
  (task 081.01). It fits apps whose pages carry the content that matters on first load,
  or need it for search engines or link previews.
- **A static frame from Rust, with the content rendered in the browser.** Many apps are
  SPA-like inside a frame: navigation, layout, the user's name, theme, and locale. Rust
  writes that frame from the session, as HTML from the app's build with a few values put
  in, and the client renders the content from the API. No V8 runs, every request is
  native, and memory falls to tens of MB. The costs: content shows later than with server
  rendering (430–480 ms on a warm load for task 079's shells, which are close to such a
  frame; 081.01), search engines see only the frame,
  and the frame's dynamic parts must be kept in step between the app and Rust. Where the
  content is SPA-like anyway and the frame is mostly static, this is the clear choice
  (2026-10-05).
- **The built client as static files, and the API alone.** The simplest: no frame from
  the server at all. The content waits for the bundle and the first API calls, which the
  frame option at least shortens by showing the app's shell at once.

The survey reports which pages need which, since an app can mix them: a public page
server-rendered, the signed-in app as a frame.

## Is the port worth it

The survey ends in a verdict on the whole app, with an estimated gain, and not only a list
of what to port. Task 081's numbers set expectations: an API action costs 8–11× less
app CPU natively, a rendered page only 1.5–2× less, and a sign-in 1.3× less; one
renderer brings the server to about 220 MB RSS at peak, and each further one adds about
50 MiB (081.01, on dataset M in Docker on a Mac, for the part of the app ported so far).

For an estimate, weight these ratios by the app's own request mix from its access logs
or load model, and add the renderers' memory; without such data, say the gain is unknown
rather than guess.

A port fits well when the server's work is auth, validation, and database reads: backends
for a frontend, CRUD apps, small and stable domains, hot paths that are API calls, and
teams that want to self-host on small machines.

The survey says plainly where a port is doubtful:

- the server leans on npm packages with no Rust equivalent, such as payment or cloud SDKs,
  PDF or image generation, or AI SDKs that stream. Each one is ported, or stays in the
  isolate and gives up the gain;
- the app mostly renders pages, so the gain is small against the isolate's memory;
- the business logic changes often, and the app is to keep two backends;
- the app depends on realtime connections, queues, or background jobs, which have no
  recipe yet;
- the load is low, where tuning the TypeScript server is the cheaper answer;
- the client reaches the server in ways that don't map to an API ([starting from server functions](#starting-from-server-functions)).

## What goes in

Only what an AI session can't quickly work out itself, because models keep improving at the
rest:

- The method: establish requirements, port from a recorded baseline, verify shared and
  intentionally different behavior, make it work and then make it fast, and leave a
  maintainable project. Measure against an agreed load model (snowtime task 078).
- Findings that took measurement or failure to learn, such as Start addressing server
  functions by a build hash (task 081.02), what each renderer costs in memory (task
  081.01), a Rust auth library claiming a Better Auth version still differing byte for
  byte and in stored OAuth state (081.39), and
  V8 keeping a bundle's whole source at two bytes per character if one character is above
  U+00FF, which an ASCII-only minify avoids (task 081.22).
- The decisions task 081 made, as a [catalogue](catalogue.md), so a session reuses them instead of
  deciding again.
- Mapping tables from each layer to its port: Drizzle to `rusqlite` with SQL strings, a
  server function to a handler, Better Auth to owned Rust (tasks 081.03 and 081.42).
- **Crates** for what every port of this stack repeats, extracted from task 081's port with
  their tests and versioned:
  - the request extractors (`InOrganization`, `AsUser`, `Public`) with the API's error body;
  - `sql!`, `Assignments`, and `list` (subtask 06);
  - `Timestamp`, the wire format, and valibot-compatible validation messages;
  - the Drizzle-compatible migrator (`MIGRATE_ON_START`);
  - Better Auth-compatible email sign-in, session cookie, origin checks, and scrypt;
  - the in-process edge (subtask 07);
  - the render host: the proven V8 pool, memory sizing, and in-process API transport
    (subtask 01). The Bun sidecar and its constrained startup and socket transport are
    planned and parked (subtask 16). Extract them only after they are proven. The bundle
    and manifest, engine bootstrap, framework request kinds, and delivery policy (whole
    or streamed) are adapter interfaces;
  - the lane: admission with waiting bounded by count and time, refusal, and cancellation
    behavior (subtasks 10 and 17). The current database lane catches job panics; the
    renderer's restart budget is separate. General worker supervision is not part of
    the first extraction unless separately proven;
  - the conformance and byte-comparison harness (`native/bench/conformance.ts` and
    `compare.ts`); the tests themselves (`conformance/`) stay with the app.

  Extraction separates what the app supplies (its scope, session lookup, error keys, and
  rate rules) from the generic parts, and moves the render bundle into the framework
  adapter ([layers](#layers-that-swap-independently)). In task 081's port these still live in one crate with the domains.

- **Codemods**, as small scripts in whatever language a session handles best, for
  conversions that recur across apps: valibot schemas to Rust input structs and
  their field tables, Hono routes to Axum routes, client functions from routes, and a
  Drizzle schema to the Rust models. With these, a session writes the rules and little else.
- The render host recipe, still to be written from the V8 port. The Bun sidecar and a
  general host for infrequent TypeScript jobs are separate planned work ("Clean first,
  hybrid only as a tradeoff"). Their future reuse must not be presented as an existing
  job runner. Drizzle's migrations are SQL files with a journal table, so Rust applies
  them without JS; task 081.33 records migration behavior that must be preserved.
- Where the port lives. A port that lags its app on purpose records the app commit it
  implements and builds the app's bundle and assets from that commit. Two layouts, with
  when each fits. The default since 2026-10-09 is a separate repository laid out as
  [the port repository](port-repository.md) describes; the other is for a proof of
  concept:
  - **A separate repository** with the app as a pinned git submodule. The app's CI doesn't
    build the port, and the app keeps only the contract: conformance tests and a load
    harness that takes a server image or address.
  - **One repository with a pin** (`native/UPSTREAM`): for a proof of concept inside the
    app's repository, as task 081 began, while the API contract still changes. Contract
    changes stay atomic and need no submodule.

App-specific code stays out: the rules, pages, and schemas are the app's. The crates hold
only what every port of the stack repeats.

The first auth and lane boundaries remain proposals. The kit's review of them (task 002)
records the seams and the behavior that extraction must preserve. Keeping integration
code in a port is an intended outcome when extracting it would make the crate depend on
that port's schema, HTTP policy, or runtime ownership.
