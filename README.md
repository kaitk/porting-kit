# Porting kit

Recipes, decisions, crates, and codemods for porting a modern TypeScript cloud app to one
Rust server with a local SQLite database. AI sessions do the porting; the kit gives them
what they can't quickly work out themselves: the method, the measured findings, the
decisions already made, and the code every port of the stack repeats.

It starts from one stack, SolidJS with TanStack Start, Drizzle, and Better Auth, and grows
layer by layer, so an app that shares only its backend stack still reuses the backend
recipes and crates.

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
| 🟡 | Lane | Admission bounded by count and time, refusal, and a restart budget. Being extracted. |
| 🟡 | Better Auth sessions | Better Auth's signed cookies, the session check with renewal, and scrypt hashes, without better-auth-rs. Being extracted. |
| 🟡 | better-auth-rs on SQLite | The library's store on `rusqlite` over the host's lanes, its transactions, and the request bridge. Being extracted. |
| ⚪ | Others | The request extractors, `sql!`, the wire format, the migrator, the in-process edge, the render host, and the conformance harness ([architecture](docs/architecture.md#what-goes-in)). |

## How a port runs

Point an agent at this repository and the app, and ask it to port the app. The
[`port` skill](skills/port/SKILL.md) is the entry point. The session follows three steps,
and proposes nothing before the user has checked what it found:

1. **Survey.** It lists everything the server does by layer, with where and how much,
   and ends with a verdict: what kind of port, whether pages need server rendering, and
   whether the port is worth it at all.
2. **Check.** The user confirms the list and adds what code can't show, such as which
   deployments must keep working.
3. **Propose.** Only then does it propose a port for each item, from the recipes, or say
   that no recipe covers it.

The port is a repository of its own, with the app as a submodule at a pinned commit
([layout](docs/port-repository.md)). The app's conformance tests and a byte-for-byte
comparison of every API answer define done, and the pin moves as the port catches up
with the app's features.

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

Regenerating snowtime-native from the kit, and porting a second, different app, are the
kit's own acceptance tests ([criteria](tasks/001-kit-acceptance.md)).

## Credits

The lanes follow ideas from [Tina](https://github.com/pmbanugo/tina): everything bounded,
immediate refusal as backpressure, CPU work kept off the event loop, and supervised
workers with a restart budget.

## License

Licensed under either of [Apache License 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT), at
your option.
