# Porting kit

An agent-run template for porting a TypeScript cloud app well: understand the app, check
that the kit fits, agree the requirements, and build a port that keeps working as it
changes. Recipes, measured decisions, crates, and codemods give the session what earlier
ports proved, and nothing it can quickly work out itself.

The first direction is a Rust server with local SQLite, starting from SolidJS, TanStack
Start, Drizzle, and Better Auth. It grows layer by layer, so an app that shares only the
backend stack still reuses those parts.

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
| 🟡 | Auth | Better Auth compatibility in port-owned Rust: sessions, password, OAuth (Google, GitHub, Microsoft), passkeys, API keys, and organizations, proven for Snowtime's scope ([recipe](recipes/auth/better-auth.md)). |
| ⚪ | Database and ORM | Drizzle to `rusqlite` with SQL strings, and Drizzle's migrations applied by the binary. Proven in snowtime-native, not written as a recipe yet. |
| ⚪ | Server | Server functions or Hono routes to an Axum JSON API ([architecture](docs/architecture.md#starting-from-server-functions)). |
| ⚪ | Frontend | Pages rendered by the app's own server bundle in V8, or a static frame from Rust. Solid with Start is proven in snowtime-native; other frameworks need their own adapter. |
| ⚪ | Turso | Planned after SQLite on one instance. |
| ⚪ | Postgres | Not planned yet. |

| | Crate | Notes |
|---|---|---|
| 🟡 | Lane | Admission bounded by count and time, refusal, and cancellation behavior. Extraction planned; the renderer's restart budget is separate. |
| 🟡 | Better Auth sessions | Better Auth's signed cookies, the session check with renewal, and scrypt hashes. Extraction planned. |
| 🟡 | Better Auth compatibility | The supported auth handlers and their SQLite operations, with optional parts per feature. Extraction planned. |
| ⚪ | Others | The request extractors, `sql!`, the wire format, the migrator, the in-process edge, the render host, and the conformance harness ([architecture](docs/architecture.md#what-goes-in)). |

## How a port runs

Ask the agent to use the [`port` skill](skills/port/SKILL.md) with the app's repository;
it never starts on its own, and asking for a survey doesn't authorize the port:

1. **Survey.** It lists everything the server does by layer, with where and how much,
   and ends with a verdict: what kind of port, whether pages need server rendering, and
   whether the port is worth it at all.
2. **Check.** You correct the findings and establish the requirements: what must work,
   what can change or be omitted, which deployments matter, and what success means.
3. **Propose.** The session recommends an approach per area, explains trade-offs and
   unknowns, and agrees the implementation scope and verification with you.

The port is then built in checked slices and handed over as a repository a fresh session
can maintain alone: shared behavior checked against the original, deliberate differences
tested, and the coverage and decisions recorded. After that the port owns itself; it may
follow the original selectively or diverge, and adopting kit updates is optional
([the workflow](docs/architecture.md#the-workflow),
[the port repository](docs/port-repository.md)).

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

The kit's own acceptance test is a fresh session recreating this port, then another
fresh session maintaining the result from its own records, then a different app and
framework ([task 001](tasks/001-kit-acceptance.md)). None has run yet.

## Credits

The lanes follow ideas from [Tina](https://github.com/pmbanugo/tina): everything bounded,
immediate refusal as backpressure, CPU work kept off the event loop, and supervised
workers with a restart budget.

## License

Licensed under either of [Apache License 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT), at
your option.
