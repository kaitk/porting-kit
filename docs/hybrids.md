# Hybrids

Sketches of ports that keep some TypeScript running, for when the clean design in the
[architecture](architecture.md#clean-first-hybrid-only-as-a-tradeoff) isn't
straightforward. None is written as a recipe yet.

- **The core ported, the long tail as JS jobs.** The app's central calls run in Rust, and
  rarely used server code runs as its TypeScript in a job lane, later possibly compiled by
  Perry (subtask 04). This fits an app with many server functions for features few people
  use, where the core ports easily. Examples are payment or cloud SDKs, PDF or XLSX
  generation, and an auth flow its Rust library lacks. Auth itself is ported as
  owned code (task 081.42); a job is the fallback for a flow it doesn't have yet. Its rules (2026-10-06):
  - **Not the renderers.** Jobs run in their own lane, with their own bundle, an
    admission budget below timer calls, and a pool that starts on demand and exits when
    idle, since a rarely used job shouldn't hold memory. A slow job never blocks pages.
  - **Trusted like the TypeScript server.** A job can reach the network. It gets only the
    secrets its job kind names, passed explicitly, and not the renderers' restrictions.
  - **The database only through the host,** preserving this design's single writer and
    admission controls. Snowtime task 043 records the driver failure and contention
    that informed that choice; it is not a general prohibition on SQLite clients in
    multiple processes. A Drizzle-based library uses Drizzle's `sqlite-proxy` driver,
    whose callback forwards each statement to the host's lanes. State a library keeps in
    memory, such as a rate limiter's counters, moves to the database, because a job
    process can exit at any time.
  - **A job kind declares three settings:** its secrets, whether it reaches the network,
    and whether it reads or writes the database.
  - **The engine follows the code.** Pure computation runs on either engine. Code that
    needs Node's APIs (`node:crypto`, `Buffer`, `AsyncLocalStorage`), as most SDKs do,
    runs on Bun, because `deno_core` has no Node layer. The survey
    classifies each candidate by its settings and the Node APIs it uses, which picks the
    engine or rules the hybrid out.

  Open: interactive transactions over the proxy, which would hold the writer across JS
  round trips (batches only, or a short deadline); and Bun-only jobs on V8-only images,
  which must either ship Bun or drop the feature. A job that streams its answer, such as
  an AI SDK's, has no recipe yet.

  This is a planned job-host design. Snowtime's rendering proves useful embedding and
  host-call techniques, but does not prove a general TypeScript job runner. A first job
  must establish its request/result contract, authentication and authorization boundary,
  queue and execution limits, cancellation, failure recovery, and side-effect behavior.
  In particular, a cancelled caller does not establish that a payment or other external
  write did not happen; the feature needs its own retry and idempotency policy. Record
  the job's source version and tests in the port's coverage record like a native feature.

- **Server functions served from Rust**, for apps where moving to an API costs too much,
  such as hundreds of server functions of kinds 1 to 3 (2026-10-05). The host
  answers `/_serverFn/<id>`, decodes and encodes Start's serialization format, and
  repeats Start's checks (`Sec-Fetch-Site`), redirects, and headers. Start is open
  source, so the protocol can be read; the cost, which this hybrid accepts, is that it
  can change with any Start release, which is why task 081.02 chose the API. The recipe
  pins Start's version and lets the conformance tests catch a change. First check whether
  Start can generate stable function IDs rather than ones from the build's hash; if it
  can, the IDs no longer change with every build, and only the serialization format is
  left to track. A cheaper variant decodes each call in the isolate and dispatches to
  a Rust rule.
- **Kind 4** has no Rust path: it stays in the isolate, or the feature is redesigned.
