# Porting kit

An agent-run template for doing a port well: understand the repository, check that the
kit fits, establish the user's requirements, and build a project that can keep working
well as it changes. The user starts the skill manually. Recipes, measured decisions,
reusable crates, and codemods give the session the knowledge and code earlier ports
proved useful.

The first direction is a TypeScript cloud app to a Rust server with local SQLite,
starting with SolidJS, TanStack Start, Drizzle, and Better Auth. It grows layer by layer:
an app sharing only the backend stack should reuse those parts, while the survey names
the framework-specific gaps.

The resulting port owns its architecture, code, tests, and documentation. It records its
source baseline and what it implements, and can later follow selected upstream changes
or develop independently. Updating the kit is optional. Maintaining the port's own
correctness and engineering quality is part of the design from initialization onward.

Early: one recipe, and the first crates are being extracted from the first port,
[snowtime-native](https://github.com/Snowhound/snowtime-native). Recipes and crates
change between commits.

[Architecture](docs/architecture.md) · [Decisions](docs/decisions.md) ·
[Catalogue](docs/catalogue.md) · [The port repository](docs/port-repository.md) ·
[Recipes](recipes/README.md) · [The `port` skill](skills/port/SKILL.md) ·
[Development](docs/development.md)

*Note: "porting kit" is a working name, and the repository will be renamed before its
first release.*

## Status

🟢 works · 🟡 partial or in progress · ⚪ not yet · 🔴 out of scope

| | Layer | Notes |
|---|---|---|
| 🟡 | Auth | Better Auth to [better-auth-rs](https://github.com/better-auth-rs/better-auth-rs): sessions, sign-out, OAuth, and API keys on the library; password sign-in, passkeys, and organizations as app code ([recipe](recipes/auth/better-auth.md)). |
| ⚪ | Database and ORM | Drizzle to `rusqlite` with SQL strings, and Drizzle's migrations applied by the binary. Proven in snowtime-native, not written as a recipe yet. |
| ⚪ | Server | Server functions or Hono routes to an Axum JSON API ([architecture](docs/architecture.md#starting-from-server-functions)). |
| ⚪ | Frontend | Pages rendered by the app's own server bundle in V8, or a static frame from Rust. Solid with Start is proven in snowtime-native; other frameworks need their own adapter. |
| ⚪ | Turso | Planned after SQLite on one instance. |
| ⚪ | Postgres | Not planned yet. |

| | Crate | Notes |
|---|---|---|
| 🟡 | Lane | Admission bounded by count and time, refusal, and cancellation behavior. Extraction planned; the renderer's restart budget is separate. |
| 🟡 | Better Auth sessions | Better Auth's signed cookies, the session check with renewal, and scrypt hashes, without better-auth-rs. Being extracted. |
| 🟡 | better-auth-rs on SQLite | The library's store on `rusqlite` over the host's lanes, its transactions, and the request bridge. Being extracted. |
| ⚪ | Others | The request extractors, `sql!`, the wire format, the migrator, the in-process edge, the render host, and the conformance harness ([architecture](docs/architecture.md#what-goes-in)). |

## How a port runs

Explicitly ask the agent to use the [`port` skill](skills/port/SKILL.md) with the app's
repository. It is manually started only. You can ask for a suitability survey without
authorizing implementation. The opening workflow is:

1. **Survey.** It lists everything the server does by layer, with where and how much,
   and ends with a verdict: what kind of port, whether pages need server rendering, and
   whether the port is worth it at all.
2. **Check.** You correct the findings and establish the requirements: what must work,
   what can change or be omitted, which deployments matter, and what success means.
3. **Propose.** The session recommends an approach per area, explains trade-offs and
   unknowns, and agrees the implementation scope and verification with you.

The agreed port then proceeds in checked slices, choosing tested libraries, recipes,
code generation, or application code for the job. Subagents are optional and run only
with your explicit approval. A costly, infrequent feature may remain TypeScript when
that is the agreed design; the general job-host recipe is still planned.

The [workflow](docs/architecture.md#the-workflow) ends with a verified project and a
usable handover: setup, current architecture, source mapping, deliberate differences,
tests, decisions, successful and failed experiments, and maintenance instructions.
Shared behavior is checked against the original; intentional differences get their own
tests. A good initial port and a maintainable result both define success.

## After initialization

The default [port repository](docs/port-repository.md) pins the original app as a
submodule and records feature coverage beside that pin. Later sessions start from the
port's current design and records, so they can add an upstream feature, fix a regression,
update a dependency, or develop a feature unique to the port without the original chat.

The port may keep only part of the app, change its architecture or frontend, stop
following the source, or be discontinued. Its documentation and checks should make those
choices explicit. It can adopt improvements from the kit where useful, with no obligation
to synchronize its template code or decisions with later kit versions.

## Concepts

- **Recipes** are Markdown, one per library under its layer, with the versions they were
  proven on, the date they were last checked, and the evidence for their numbers
  ([format](recipes/README.md)). A layer without a recipe says so; the kit doesn't guess.
- **Decisions** are recorded once, with the evidence and what was rejected, so a session
  reuses them instead of deciding again ([catalogue](docs/catalogue.md)).
- **Crates** hold only what every port of the stack repeats. Each one is optional and
  plugs in alone, and none depends on the frontend framework. Code shaped by one app is
  template code the port owns.
- **Honest verdicts.** A port pays off when the server's work is auth, validation, and
  database reads. The survey says when it doesn't: a server built on npm packages with no
  Rust equivalent, an app that mostly renders pages, or a load the TypeScript server
  handles fine ([is the port worth it](docs/architecture.md#is-the-port-worth-it)).

## The first port

[snowtime-native](https://github.com/Snowhound/snowtime-native) ports
[Snowtime](https://github.com/Snowhound/snowtime), a multi-tenant time tracker, by hand.
Against its pinned commit it passes all 66 of the app's conformance tests and answers all
1,490 compared API calls byte for byte.

Measured against the TypeScript server on the same data, in Docker on a Mac (snowtime
task 081.01):

- An API action costs 8–11 times less of the app's CPU, a rendered page 1.5–2 times
  less, and a sign-in 1.3 times less.
- With one renderer, the server peaks at about 220 MB RSS under load; each further
  renderer adds about 50 MiB.
- Under a 40,000-user overload, bounded lanes took the server from 525 threads and 364 MB
  to 9 threads and 205 MB (task 081.17).

The first acceptance test is a fresh session recreating Snowtime's port from the agreed
source baseline, without the original session's context. A separate fresh session then
maintains the generated port using its own records. Later tests move to a different app
and SvelteKit, followed by other frameworks as they are proven. Sol 6.1 and Claude Opus
5.5 are target agents; successful full replays on them have not yet been recorded.
[Task 001](tasks/001-kit-acceptance.md) defines the checks and records the existing
framework candidates, whose suitability for full ports still needs assessment.

## Credits

The lanes follow ideas from [Tina](https://github.com/pmbanugo/tina): everything bounded,
immediate refusal as backpressure, CPU work kept off the event loop, and supervised
workers with a restart budget.

## License

Licensed under either of [Apache License 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT), at
your option.
