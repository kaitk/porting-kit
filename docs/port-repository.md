# The port repository

The kit generates a port as its own repository, kept in sync with the app it ports. This
is the default layout until a better one is proven (2026-10-09). `snowtime-native`,
the hand-built port of Snowtime (snowtime task 081), is the first repository in it, so
regenerating it from the kit later can be compared file by file.

The rule: the port repository holds only what the port adds. Anything it can fetch from
the app at the pinned commit, it fetches.

## Layout

```text
<app>-native/
  app/              the app, a git submodule at the pinned commit; never edited here
  crates/           the Rust server, host, and render crates; the kit's crates once
                    they exist, as dependencies
  adapter/          the frontend framework adapter: the render bundle's build,
                    bootstrap, stubs, and optimizations, run on app/'s toolchain
  harness/          the byte comparisons (API, pages, hardening), the native server
                    starter, and their fixtures
  conformance/      conformance tests the port adds beyond the app's own
  deploy/           the image build, compose files for benchmarks, the V8 archive script
  docs/             the port's architecture and its records (task history, measurements)
  .github/workflows/
  Cargo.toml, deny.toml, licenses/, rust-toolchain.toml
```

## The adapter

Decided 2026-10-09. The code that builds the render bundle belongs to the port,
in `adapter/`, because only the native renderer needs it: the build script, the framework
stubs and bootstrap, and size optimizations such as shared props and the ASCII-only minify
V8 needs. The app carries none of it. Its `package.json` gets no dependencies and no
script changes for the port.

The adapter runs on the app's own toolchain. The bundler, the framework's compiler plugin,
the CSS and i18n tools all load from `app/node_modules`, so their versions are always the
pinned commit's; a different compiler plugin compiles different output, which the page
comparison would catch. `adapter/package.json` lists only what the app lacks, such as
the minifier. An app upgrade that breaks the adapter shows up when the pin moves, the sync
point the kit plans for.

The kit ships an adapter per frontend framework as a template the generated port owns. Its
framework-independent parts, such as the minify and the bundle size checks, become a kit
package once a second framework needs them. An app whose build the adapter can't drive
needs another adapter, or the survey marks it as having none yet.

## The pin

- `app/` is a git submodule. git records the exact commit, a change that moves the pin
  and ports what the app added is one commit, and CI checks the app out with the port.
  An `UPSTREAM` file with a fetch script would work as well; switch if submodules get in
  the way of agents or worktrees.
- The pin records which of the app's features the port implements and which client
  bundle it serves (2026-10-10). A `main` commit that doesn't change the port's
  output in a meaningful way, such as tests, tooling, or docs, can move the pin with no
  porting, after the port passes its bar at the new commit. The pin doesn't have to
  follow every commit: when several people land features, the port catches up at its
  own pace. Smaller steps keep each comparison to one change, so prefer them when they
  come cheaply. The pin may be a local `main` commit that isn't pushed yet; CI then
  can't fetch it, so push the app before the port.
- The pinned commit's conformance tests and byte comparison define what "matches" means.
  The port's README names the commit and the counts it passes.

## What comes from the app

- The render bundle and client assets: the app's own build at the pin, then the adapter's
  build script. Neither is committed; CI and local runs build them and may cache them by
  the pin's hash. The bundle is unique per app, which is why its build script is adapter
  code the port owns rather than kit code.
- The migrations, read from `app/` at startup.
- The contract: the app's conformance tests, its seed and test fixtures, and its load
  harness, which takes a server address or image.

## What the port owns

- The Rust code, the adapter, and the comparison harness, until the kit extracts the
  generic parts into crates and packages.
- Conformance tests the app hasn't taken. The kit suggests changes to the app that make
  later ports easier, and never requires them, so the harness runs the port's
  `conformance/` beside the app's. A test the app adopts moves out of the port's folder.
- Its documentation and records. A generated port has no proof-of-concept history: it
  starts with one commit, "Port at <app> <commit>". A hand-built port's history stays
  where it was built, and its records move into `docs/`.

## Findings from snowtime-native

Building `snowtime-native` in this layout on 2026-10-09, from the PoC branch at
`cd2d83b` with the pin at snowtime `1eedd18`, kept every count of the PoC's bar. These
are what the kit's generator should do the same way, and why.

- **The app's packages through one link.** The port's root `node_modules` is a committed
  link to `app/node_modules`. The harness, the port's conformance tests, and the adapter
  resolve the app's packages without an install of their own, and Vite follows the link
  to the same real paths the app's own source resolves to, so each package loads once.
  `adapter/package.json` holds only the minifier, and the root `tsconfig.json` extends the
  app's and maps its `~/` alias into `app/src`.
- **Build the app as its release does.** The adapter's bundle embeds the client manifest
  of an app build. Snowtime's `bun run build` runs Vite under Node and its release script
  runs `bunx --bun vite build`; the two split the client chunks differently, so pages list
  different scripts. The adapter's instructions and CI use the release command, which the
  harness's own build also uses. The kit's survey should find that command, not assume
  the `build` script.
- **Install from the pinned lockfile every time.** The PoC's checkout had a stale
  `node_modules` with nested older seroval copies its lockfile no longer listed, and its
  bundle came out 55 KB larger. A frozen install of the pinned lockfile gave a bundle
  byte-identical to the port's. The adapter's build should start from a frozen install.
- **App changes the pin lacks.** Harness and test changes the app hasn't taken yet stay
  in the port until the pin passes them: a conformance file in the port's `conformance/`
  replaces the app's file of the same name, a harness module wraps what the app's test
  library lacks, and a change to the app's own tooling (snowtime's load harness) is a
  patch in `deploy/load/` applied to the submodule only for a run. Each names the app
  commit that makes it unnecessary.
- **`app/` stays clean.** The adapter rewrites one generated app file during its build
  and restores it, and every build output lands in paths the app's `.gitignore` already
  covers, so `git -C app status` stays empty after a full run of the bar.
- **The submodule URL is relative** (`../snowtime.git`), so it follows the port's own
  remote and protocol. CI needs read access to the app's repository; for a private app,
  the checkout needs a token with that access.
- **A quick performance gate belongs in the harness.** snowtime-native carries
  `harness/perf-gate.ts`: a retained baseline binary against the current one, A/B/A/B in
  one session, page renders, hot API calls, and a short load slice, about 1–2 minutes,
  with a noise band from the two baseline rounds. It was asked for before refactoring
  the port into kit crates. A generated port should get one from the start, so each
  refactor step is checked for speed as the byte comparisons check behavior.
- **Benchmark settings stay in the benchmark.** The gate's branch turned rate limits off
  in the shared native server starter, which broke the hardening check that measures
  production limits. Each harness passes the environment it needs.
- **A page comparison needs a control from the same app commit.** The port's first
  `page-compare.ts` control is the PoC's host, built from a clean worktree of the PoC
  branch with a frozen install: 59 of 59 pages byte-equal.

Running the gate on a Mac through Docker Desktop on 2026-10-10 found four faults the
port had carried from the gate's branch without running it, and settled how a gate
handles a noisy machine:

- **Run a ported harness before counting it as ported.** The gate's container imported
  the app's packages before installing them, read k6's summary export in the
  `handleSummary` shape, and checked a `/readyz` field the audit had removed; the
  preparation's certificate check waited on an app it never started. The byte
  comparisons ran on every move; the gate hadn't run once.
- **A crash must not read as a regression.** Bun exits 1 on an uncaught error, the
  gate's code for a regression, so calibration retried a crashing gate 6,139 times in
  two hours. A gate counts exit 1 only with a finished comparison, and calibration
  stops after six attempts.
- **A harness doesn't read configuration from a public health endpoint.** `/readyz`
  stopped reporting whether rate limits are on, because that disclosed it; the gate
  sets the server's environment itself.
- **Machine differences go in named profiles.** Each run compares baseline and current
  in one session on one machine, so a profile only sets the pinned CPU, the counts, the
  floors, and how rounds combine. Any machine can run any profile. A Mac's Docker CPUs
  are macOS threads that get descheduled, so its profile keeps each side's lower round
  and a wider render floor; a Linux machine keeps the mean.
- **CPU counted in clock ticks needs a resolution floor.** Two rounds' `/proc` readings
  can differ by two ticks with no change, which at 1,000 calls is 0.02 ms per call.

Moving snowtime-native's auth onto better-auth-rs `master` (`9f91cd7`) on 2026-10-10
(task 081.39) tested the kit's auth recipe:

- **A library that claims a reference version still needs the byte comparison.**
  better-auth-rs targets better-auth 1.7.6, yet sign-out alone differed in five ways:
  error-body key order, cookie attribute order and `Expires`, a deduplicated repeat
  cookie, and body parsing after the origin check. Each was a small fork fix. The kit
  should mount one route at a time and run the comparison after each.
- **Check a library's protocol state, not only its responses.** Its OAuth state (format,
  verification identifier, cookie encoding) is the pre-1.7 design, so a flow can't cross
  backends and better-auth's stored rows aren't found. Too large for a fork patch; the
  recipe needs a fallback per area, such as keeping the hand-ported flow beside the
  library, decided before the port starts on that area.
- **Feature flags decide a dependency's crypto.** The library's TLS feature pulled ring
  into the app's own reqwest client, and its JWT backend pulled `rsa` with an unfixed
  advisory. The kit's dependency review runs `cargo tree -i` for ring and `rsa` and
  cargo-deny before the first route moves.
- **A store that the app owns outlives the library's lifetime.** The library instance
  holds the store, and the app holds the library, so the store takes a weak reference
  to the app, and the app builds the library on first use.

## Open

- How the app's load harness takes a port. Snowtime's `perf/stress` knows the native
  backend by name (`--app=native`); it should take an image and a compose overlay, so a
  port needs no patch to the app's tooling.
- Where the comparison harness's generic parts go: a kit package that the port depends
  on, or template code the port owns. Snowtime's harness is still one folder.
- How the harness finds the app's fixtures when the app has none suited to it. Snowtime's
  `perf/lib` seeds a database and starts the TypeScript server; another app may need the
  kit to generate them.
