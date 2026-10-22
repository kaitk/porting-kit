# The port repository

The kit initializes an independently maintained project. Its repository must explain
what it implements, why it is built that way, how to change it, and how to establish that
it still works. A later maintainer or agent should be able to do that without the initial
conversation or a newer copy of the kit.

The default layout comes from `snowtime-native`, the hand-built port of Snowtime
(snowtime task 081). It is a starting point, not a permanent shape. Reuse source files
from an exact, fetchable source commit while that serves the port; own the code and
documentation that the port adds or changes. A replacement or diverging project may
change its layout, frontend, dependencies, and relationship to the original.

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
  AGENTS.md         entry point for later work, linking the port's own instructions
  README.md         scope, setup entry point, source baseline, and verification status
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

The intended kit adapter is template code the generated port owns. Solid with Start is
proven in snowtime-native; adapters for other frameworks still need to be written and
tested. Framework-independent parts, such as minification and bundle-size checks, become
a kit package once a second framework proves the reuse. An app whose build the adapter
cannot drive needs another adapter, or the survey marks the gap.

## The pin

- `app/` is a git submodule. git records the exact commit, a change that moves the pin
  and ports what the app added is one commit, and CI checks the app out with the port.
  An `UPSTREAM` file with a fetch script would work as well; switch if submodules get in
  the way of agents or worktrees.
- The pin records the source baseline and, when the source builds the client, that
  client's version. A separate coverage record names what is implemented, omitted,
  retained in TypeScript, or deliberately different. Selectively porting a later feature
  records its source commit without claiming all intervening features are implemented.
- Moving the pin may also change the frontend, migrations, fixtures, and build tools.
  Review those together. Even a docs-only source update must pass the checks applicable
  to what the build consumes. Smaller steps keep a comparison understandable.
- A local source commit may be used while developing, but a shared build must be able
  to fetch it. Publication follows the user's authorization; a source pin is not
  permission to push either repository.
- The port's README names its baseline, coverage record, and last verified result. For
  areas intended to match, the source's conformance and byte comparisons define parity.
  Deliberate differences have their own acceptance tests. Passing a selected suite does
  not establish whole-app parity.

## The kit relationship

Record the kit revision used at initialization and the recipes or templates actually
used. This is provenance. A port does not need to track kit releases or periodically
regenerate itself. Its current architecture and requirements govern later work.

Kit crates are ordinary dependencies, pinned independently of the original-app baseline.
The port may update, replace, vendor, or remove one as its needs change. Dependency
maintenance and security checks remain part of maintaining the port, even when no kit
update is adopted. Template code is owned locally; a newer template is a proposed change
to review, not an instruction to overwrite local work.

When a kit improvement is useful, apply the relevant part, test it against the port's
contract, and record the new decision or dependency pin. Contributing a finding back to
the kit is optional and does not block a port fix.

## What comes from the app

In the default layout that shares the original frontend and schema:

- The render bundle and client assets: the app's own build at the pin, then the adapter's
  build script. Neither is committed; CI and local runs build them and may cache them by
  the pin's hash. The bundle is unique per app, which is why its build script is adapter
  code the port owns rather than kit code.
- The migrations, read from `app/` at startup.
- The contract: the app's conformance tests, its seed and test fixtures, and its load
  harness, which takes a server address or image.

## What the port owns

- The application code, adapter, retained TypeScript jobs if any, and comparison harness.
  The port chooses which generic components to take as dependencies.
- Conformance tests the app hasn't taken. The kit suggests changes to the app that make
  later ports easier, and never requires them, so the harness runs the port's
  `conformance/` beside the app's. A test the app adopts moves out of the port's folder.
- Its documentation and records, including the new port's own experiments and decisions.
  It does not inherit the first port's task history as if those experiments ran here.
  The initial accepted state records the source commit and verified scope; retaining
  useful implementation commits is compatible with that baseline.

## Documentation that stays useful

Use the repository's established formats when they already serve these purposes.
The following is the default division of responsibility, based on snowtime-native's
architecture and task records. Keep each fact in one current location and link to its
evidence rather than making every task repeat the whole project.

| Record | What a future maintainer must be able to learn |
| --- | --- |
| `README.md` | Purpose, supported scope, source baseline, current limitations, how to start, and where verification is recorded. |
| `AGENTS.md` and any agent-specific entry point | The port's rules, where to find current decisions, how to add a feature, and which checks apply. No dependency on agent memory. |
| `docs/development.md` | Clean-checkout prerequisites, pinned tools, fixture preparation, local runs, build and check commands, generated files, and reproducible setup traps. |
| `docs/port-status.md` | Source provenance, feature coverage, source-to-port mapping, retained TypeScript, omissions, intentional differences, and later selected upstream changes. |
| `docs/architecture/` | The current design by area: ownership, runtime and database boundaries, interfaces, operational constraints, and why this design fits the target stack. |
| `docs/decisions.md` or existing decision records | Dated choices, alternatives, evidence, costs, and what would justify reconsidering them. Superseded decisions point to their replacements. |
| `docs/tasks/` | What changed or was tried, results and failed approaches, verification evidence, remaining questions, and the next actionable step. |
| `docs/known-issues.md` | Active reproducible limitations, their impact, workaround where available, and a link to the owning task. Create it when there is an issue to record. |
| Deployment and operations docs | Configuration, secrets, migrations, backup and restore, health and diagnostics, release and rollback, and resource limits for the supported deployment. |

Small projects can combine records; these are responsibilities, not a required number
of files. Do not create empty documents merely to fill the layout.

### Coverage and differences

Start `docs/port-status.md` with the source repository, baseline commit, kit provenance,
and the scope agreed with the user. Add a row per meaningful feature or area; use finer
rows where compatibility, implementation, or source version differs. A useful row records:

- Source paths or symbols and the relevant commit; target modules and routes.
- Coverage: complete for the agreed scope, partial, deferred, deliberately omitted,
  or removed after the initial port.
- Implementation: native code, a library, retained TypeScript job, or a combination.
  An implemented TypeScript feature is covered functionality, not an unported omission.
- Behavioral differences and the linked decision, including changes made to fit the
  target language, framework, database, or deployment.
- Verification: relevant tests or comparison suite, the last verified revisions, and
  any uncovered cases. Keep detailed run evidence in its task.

The source pin alone cannot express a partial or diverging port. Conversely, do not
build a duplicate symbol database: map at the level where it helps someone locate and
assess a change. Record migration and shared dependency effects that cross feature rows.

Snowtime provides concrete examples for this record:

- Its native session check omits the TypeScript cookie cache because the database is
  local; immediate revocation is a deliberate behavior difference (snowtime task 091;
  snowtime-native task 081.03).
- Native auth input bounds deliberately differ and have native tests; oversized requests
  are not masked or counted as byte-equal comparisons (snowtime-native task 081.31).
- API-key last-use writes are sequenced differently to fit the single writer, while the
  response still waits for the save attempt (snowtime-native task 081.38).
- Organization and passkey library experiments were rejected after comparison. Their
  evidence and reconsideration conditions explain why port-owned code remains
  (snowtime-native tasks 081.39 and 081.40).

### Current design and historical evidence

Architecture describes what the repository does now. Decision records explain why.
Tasks retain the history of trials, including failures and measurements that no longer
describe the current version. Update the current architecture and coverage with a change;
preserve an old task's evidence and clearly label a superseded conclusion.

Record enough to reproduce an experiment: source and port revisions, relevant dependency
versions, commands, fixture identity, environment, result, and interpretation. State what
was not tested. Keep a durable summary and a fetchable artifact or commit for evidence
that matters to the decision. A local temporary patch can help during work but cannot
be the only surviving explanation of a rejected approach.

## Maintaining the port

These steps apply in an ordinary development session. The kit skill is optional after
initialization; neither scheduled kit use nor automatic synchronization is required.

1. **Establish the current state.** Read the port's instructions, scope, architecture,
   coverage, and relevant task records. Confirm which source revision a requested change
   comes from, if any, and which intentional differences must remain.
2. **Assess the change.** Compare the relevant source changes with the recorded baseline
   or feature revision. Trace effects on data, clients, auth, jobs, rendering, deployment,
   and shared contracts. Agree any change in scope or behavior with the user. An
   upstream commit is input to that decision, not a requirement to adopt every change.
3. **Implement against the current design.** Reuse local abstractions and accepted
   decisions. Keep generator inputs and outputs consistent. For a retained TypeScript
   feature, review its bundle, runtime, host interface, permissions, and dependency pin
   as part of the feature.
4. **Verify.** Run the affected checks and the repository's required integration bar.
   Compare shared behavior; test deliberate differences directly. Check data and
   migration effects, and rerun the relevant performance gate for changes that can affect
   its budget. A failed run is evidence to investigate, not a new baseline to accept
   silently.
5. **Update the durable state.** Record the source change adopted, the feature coverage,
   decisions, verification, and unresolved issues in the same change. Move the source
   pin only when the files consumed from it and the recorded coverage are consistent.
   Update setup or operations instructions when their commands or assumptions change.

The initial port supplies executable checks and CI appropriate to its scope, with
fixtures and documented commands. Important behavior should be guarded by those checks,
not by a future agent remembering prose. Keep production configuration distinct from
benchmark overrides, and define the scope and exclusions of parity and performance
checks. Native tests continue to protect independent features if comparison with the
original is eventually retired.

A fresh session maintaining the generated port is a separate acceptance test from the
initial port replay. It must discover the current state, implement a representative
change, run the checks, and update the records using the port alone. See
[task 001](../tasks/001-kit-acceptance/README.md).

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
