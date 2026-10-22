# Catalogue of port decisions

Each entry gives the decision, the evidence, what was rejected, and when it applies to
another app and when it doesn't, so a session reuses it rather than copying it blindly.
It starts with task 081's. An entry still open says so and names the subtask that settles
it:

These are evidence-backed starting points. A port records its own accepted choice,
applicability, and later changes; it need not follow a new catalogue revision. Historical
measurements retain their original workload and version limits. The maintenance records
belong in [the port repository](port-repository.md#documentation-that-stays-useful).

- Rendering in an embedded V8 isolate, against page shells (01, task 079)
- The render engine, chosen from measured inputs: rendering's share of the server's CPU,
  the memory per renderer including a recycle's overlap, whether the framework needs
  streaming, and the licensing a closed-source port accepts. For Snowtime: V8 in the
  host, at 1.21–1.30 times Bun's render CPU (22); the Bun sidecar parked; embedded JSC
  paused. Open: the gap confirmed on Linux, and whole-server load showing whether the
  render lane saturates first (10, 12, 16)
- Tokio at the edge, with fixed worker lanes and waiting bounded by count and time
  for database work, hashing, and rendering. Database and hash gates use a 4,096-waiter
  memory backstop and a 1,000-ms deadline (17); the new one-core hold passes at
  20,000 users with zero refusals. The 32/128 limits refuse instantly at
  loads the unbounded host handles; size from throughput times deadline with spike
  headroom. A 32-KiB planning estimate per waiter budgets 128 MiB per gate, excluding
  large bodies and renderer heaps. Keep the smaller report budget, which protects
  other organizations' timer reads under a report burst. The one-core runtime
  comparison is inconclusive: the valid 5,000-user pair favors `current_thread`, but
  lacks repeats, so the `multi_thread` default stays unchanged. A refused edit stays
  pending in the client; an API refusal during rendering reaches the page as 503 with
  `Retry-After` and keeps a completed renderer warm. Record phase RSS against the
  provisional 2-GiB whole-host budget for M, with no OOM or swap and passing recovery.
  Open: the four-configuration capacity rerun and valid eight-reader overload in 27.
  Results: [native host](https://github.com/Snowhound/snowtime-native/blob/main/docs/architecture/native-host.md)
- Static files served from disk, behind a CDN or caching proxy (2026-10-08,
  from audit finding M6 in 30). Snowtime runs behind Cloudflare, which caches the
  immutable `/assets/` and the week-cached `/backgrounds/` and `/brand/`, so few file
  requests reach the origin. The host keeps an index of the public directory's paths
  so pages and missing-file probes skip the disk, and reads real files from disk.
  Rejected for Snowtime: preloading the public files into memory (36 MB, 32 MB of it
  backgrounds) to serve CDN misses. It applies to an app served without a CDN or proxy,
  where the origin answers every asset request: preloading the hot files (Snowtime's
  `/assets/` and `/brand/`, about 3.4 MB) then takes file reads off the request path.
  The kit asks during setup whether a CDN or caching proxy will front the app, unless
  the repository already answers it (deployment docs, proxy or CDN configuration)
- A shared JSON API when both backends must serve the same client (02, snowtime task
  084). The source-app transition needs agreement; a replacement or a framework-bound
  interface may need another contract. Preserve the transferability assessment and
  any deliberate changes in the port's coverage record.
- JSON with dates revived by the schemas, and answers validated in full (task 089).
  Open: columns for the large responses (081 question 2, 02)
- Routes and modules per domain, with source-to-port correspondence useful for later
  changes (06, snowtime task 089). Use target-language conventions where appropriate;
  document a structural difference instead of forcing an unsuitable source layout.
- Axum, and `rusqlite` with SQL strings over SeaQuery; Rocket, Diesel, and sqlx not
  tried (03, 06)
- One writer and a pool of readers on WAL; bounded database work that refuses with 503
  past count or time bounds. A report budget leaves ordinary readers available under
  a single-organization burst (17). A single connection still delays timers while a
  report runs. Open: valid overload and capacity evidence at the chosen backstop in 27
- Tokio at the edge, lanes behind it ([native-host.md](https://github.com/Snowhound/snowtime-native/blob/main/docs/architecture/native-host.md),
  2026-10-06; a design guideline for the kit, 2026-10-08). From
  [Tina](https://github.com/pmbanugo/tina), adopt what fits a Tokio stack: everything
  bounded, immediate refusal as backpressure, CPU work kept off the event loop,
  supervised workers with a restart budget, and no work for callers that left. Measured
  in 081.10 and 081.17: a 40,000-user overload fell from 525 threads and 364 MB to 9
  threads and 205 MB, and the 20,000-user hold passed with no dropped actions. Reject
  thread-per-core, no work stealing, and per-core deterministic scheduling: hyper,
  rustls, and quinn need Tokio, with no measured gain to justify replacing them. The
  async edge plus separate lanes is the split Tina's author argues against; the shared
  lane contract is what makes it safe, so the kit names it as a deliberate deviation.
  Open: seeded, reproducible tests of the lane contract (deadlines, cancellation while
  waiting, restart budgets) with `tokio::time::pause`, `turmoil`, or `loom`, kept only
  if they find bugs the current tests miss
- Better Auth through an app-owned `rusqlite` store on the host's lanes (question 5,
  [auth spike](https://github.com/Snowhound/snowtime-native/blob/main/docs/tasks/auth-spike.md), 2026-10-06). The 1,582-line adapter proves storage and
  selected flows without SeaORM or sqlx. Reject a library-owned pool where the host
  owns admission and one writer. Bound an async transaction's writer lifetime
  separately from admission. Keep the app's signed-cookie check at the boundary.
  This applies to a Better Auth/SQLite port that keeps its schema; applications with
  attestation policies cannot reuse the spike's passkey mapping. At the spike's alpha.3
  pin, server-only key calls and passkey compatibility blocked adoption. Task 081.39
  subsequently adopted selected flows on a newer pinned fork; 081.40 retained native
  passkeys after comparison. The old gate describes that experiment, not an open
  instruction to repeat it unchanged.

  Every flow in port-owned code, from task 081.28's hand-port (2026-10-22, task 081.42).
  better-auth-rs was tried in 081.39 for sessions, sign-out, OAuth, and API key creation:
  the same bar passed, but auth code grew by 230 lines plus a +970/−320 fork, the binary
  by 4.7%, and v1.0.0-alpha.5 later required the system ICU library. Rejected as a
  dependency; it stays a reference. The conformance tests, byte comparison, fake OAuth
  provider, and software passkey authenticator judge the owned code. The
  [auth recipe](../recipes/auth/better-auth.md) has the numbers and the steps.

- AWS-LC for scrypt (08)
- The optional in-process edge, and Caddy's tuning where Caddy stays (07)
- Drizzle's migrations applied by the binary, recorded as drizzle-orm records them
- Litestream for backups (`docs/hosting.md`). Open: Turso's engine (11)
- Renderers sized from memory and pressure, and a page buffered whole (01). Buffering suits
  finite pages like Snowtime's. A framework that relies on streaming, such as SvelteKit's
  streamed promises or Next.js's server components, needs its own adapter and delivery
  policy, and the survey says so instead of promising one run. Open: the memory target,
  which awaits the maintainer's agreement (01)
- Conformance and byte comparison define parity for shared behavior (081 question 4,
  03). Intentional differences have their own recorded decisions and tests: native
  input bounds in 081.31 and session-cache behavior in snowtime task 091 are examples.
  A passing comparison alone does not establish migration safety, overload behavior,
  or a maintainable handover; the whole-port audit in 081.30 found issues beyond it.
- The repository layout (task 081, "Repository")
- HTTP/3 deferred. Open: measured in 09

