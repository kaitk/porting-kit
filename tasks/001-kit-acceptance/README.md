# 001: The kit's acceptance criteria

Status: in-progress

The kit succeeds when a fresh session uses it to produce a well-founded port, another
fresh session can maintain that port from its own records, and reuse holds up on a
different app. A working binary alone does not establish those outcomes.

## Validation sequence

### 1. Recreate the Snowtime port

Use a fresh session with no prior conversational knowledge of the port. Give it the kit
at a recorded revision, Snowtime at the agreed source baseline, the user's goals and
constraints, and the tools and resources authorized for the run. Explicitly invoke the
port skill. The existing replay baseline is before task 084, the first parent of
`2f13db0`, so the session must assess the server-function boundary as well as the native
implementation. Record any approved change to that baseline.

The kit's declared recipes and pinned reference code are legitimate inputs. Record which
were used. Do not give the session the evaluator's conclusions, the original chat, or an
unrestricted finished-port checkout as an answer to copy. The evaluator can compare with
snowtime-native separately. If broader reference access is deliberately tested, record
it as a different condition rather than calling the runs equivalent.

The session still asks the user questions. The replay tests whether it discovers the
right questions and produces useful proposals, not whether it guesses the historical
answers. Changes to the source app, omitted features, or altered behavior need an
explicit agreement. Better choices than the first port's are acceptable when justified
and verified. File-for-file identity is not the success criterion.

### 2. Maintain the generated port without the kit

Give a separate fresh session the generated repository and a representative maintenance
request, with access to the source revisions it needs. Do not supply the initial chat,
an updated kit, or the first session's memory. Confirm that the repository itself lets
the session locate the affected code, understand the decisions, reproduce the setup,
make the change, run the checks, and leave the records current.

Include a selected upstream feature and a port-specific fix or architectural change.
At least one case should preserve an intentional difference or omission: the maintainer
must not reintroduce a dropped feature or undo a deliberate design just because the
original app or a newer template does something else. Changes to the agreed scope still
go to the user. Do not move a baseline pin to imply adoption of unimplemented changes.

### 3. Test another app and framework

After the Snowtime replay, choose another app, including SvelteKit, and assess its fit
before committing to a full port. Test reuse of backend recipes independently from the
new framework adapter. Expand to other frameworks as concrete ports prove their recipes.

Existing candidates come from snowtime-native
[task 081.15](https://github.com/Snowhound/snowtime-native/blob/main/docs/tasks/15-framework-benchmarks.md):

| Framework | Recorded candidates | What remains to establish |
| --- | --- | --- |
| SvelteKit | `sveltejs/realworld` | Current buildability, backend stack, user requirements, and suitability for a complete port. |
| Nuxt | `nuxt/movies`, or Elk for a heavier page | The same suitability assessment, beyond the planned rendering benchmark. |
| Next.js | `vercel/commerce`, or the App Router playground | Whether the selected feature scope can be ported, including framework-bound server behavior and streaming. |

These are recorded rendering candidates, not claims of current compatibility or selected
full-port projects. Confirm their revisions, license, data requirements, and suitability
when that follow-up starts. A render-core benchmark does not prove a complete framework
adapter or backend port.

## Record each run

Record source and kit revisions, model and agent-tool versions, provided context and
reference access, environment, authorized tools, and any approved delegation. Sol 6.1
and Claude Opus 5.5 are the target agents for now, and open models are to be tried later;
record results per agent rather than inferring one from another.

Retain the survey and fit verdict, questions and user answers, accepted proposal, design
decisions, checks and their limits, measurements, handover, user interventions, and gaps.
Record elapsed time and available resource usage alongside the outcome. More runs are
acceptable when they produce a better port; the one-run stretch goal is not a reason to
omit requirements work, verification, or useful documentation.

For each failure, distinguish a kit omission from a model/tool limitation, an unsupported
stack, a missing requirement, or a faulty fixture. Fix or document the cause before
claiming the next run validates the same workflow.

## Runs

### Pilot 1: survey only (2026-10-22)

- **Scope:** stage 1 up to the requirements step. The session surveyed, gave a fit
  verdict, and wrote down its questions with recommended answers; no user answered and
  nothing was built.
- **Inputs:** the kit at `743b9f4`; Snowtime at `adcedc7`, the first parent of `2f13db0`,
  with `tasks/081-native-backend.md` and `tasks/079-static-route-shells.md` removed from
  the checkout, since they hold this port's plan. Tasks 078 and 080 still mention that a
  native backend was planned. No reference code was opened.
- **Agent:** Claude Opus 5.5 in Claude Code, a fresh subagent with only its brief, no
  subagents of its own; about 6.5 minutes and 150k tokens. Read about 11 kit files and
  20 app files in full, and grepped about 60 more.
- **Result:** a 488-line survey, kept as [pilot-1-survey.md](pilot-1-survey.md). It reached the decisions the first port made: a second
  backend for self-hosting with production staying on Vercel and Turso, the app moved to
  a JSON API first, server rendering in V8, and Better Auth upgraded to 1.7.7. Its 17
  questions covered what the maintainer decided in task 081, plus the change rate (104
  server commits in 10 days) as a maintenance risk.
- **Gaps it found, and what changed:**
  - No recipe for the move to an API, the largest piece of work for this app: added
    `recipes/server/server-functions.md`.
  - The kit quoted task 084's 32/9 transferability split without its criteria, anchoring
    a survey of the same app; the pilot counted 37/4 because it didn't check outputs
    (five project functions returned audit columns). The count is gone from the
    architecture, and the recipe and the survey step say to check outputs.
  - No survey template or advice on where to look in a Start app: added to the
    workflow's survey step, with request-scoped `AsyncLocalStorage` and the server entry.
  - The auth recipe didn't say its reference implements Better Auth 1.7.7: now the first
    choice for the user.
  - The frontend recipe missed the server entry's i18n, CSP nonce, and render context:
    added as a step.
  - No method for the gain estimate, and no framing for a production on a remote
    database: added to the architecture.
  - A stale README, Drizzle's "journal" wording, and bare subtask numbers: fixed.
  - The hybrid sketches cost reading time in a survey: moved to `docs/hybrids.md`, with
    a reading guide at the top of the architecture.
- **Open:** schema messages translated at run time. The app's valibot messages call
  Paraglide (`src/server/schemas.ts`); snowtime-native answers English messages, and
  nothing records how that matched the app at its pin, so no recipe says yet.

## Acceptance criteria

### Workflow and handover

- [ ] Manual-only invocation checked in each supported agent environment; a repository
      inspection or a discussion of porting does not start the workflow implicitly
- [ ] A good-fit, a partial-fit, and a poor-fit survey exercised, with named evidence and
      unknowns; implementation follows the user's agreed requirements
- [ ] Tool choices are justified per area, including library compatibility and generator
      ownership; no subagents are started without explicit user approval
- [ ] Generated repositories contain the records and executable checks in
      [the port repository](../../docs/port-repository.md#documentation-that-stays-useful),
      with current architecture distinct from historical experiments
- [ ] Native features, retained TypeScript, partial coverage, omissions, and intentional
      differences are represented without making false whole-app parity claims
- [ ] A clean-checkout setup and verification run succeed from the generated instructions
- [ ] The separate maintenance session completes its change and updates coverage,
      decisions, and evidence without needing the kit or the original conversation
- [ ] The port remains buildable with its recorded dependencies without adopting a newer
      kit revision; optional kit updates follow the port's ordinary review process

### Proven content and initial replay

- [ ] Recipes written only for steps proven in task 081's port
- [ ] [The catalogue](../../docs/catalogue.md) written, one entry per decision, with its
      evidence
- [ ] The crates in [architecture](../../docs/architecture.md#what-goes-in) extracted from task 081's port, with their tests, and the port
      using them
- [ ] Codemods only for conversions done by hand at least once, with their tests
- [ ] The workflow in [architecture](../../docs/architecture.md#the-workflow) written as the repository's entry point: the survey with the
      kind of port and the verdict, the user's check, then proposals
- [ ] The transferability check for server functions written as a recipe, which on this
      app's 41 gives task 084's table, and the middle step to the API written as a recipe
      from task 084
- [ ] A fresh AI session, under the input conditions above, ports this app from its
      server-function baseline (before task 084: the first parent of `2f13db0`), and its
      result passes the conformance tests and byte comparison. The replay records its
      runs, what the user did between them, and each gap it hit
- [ ] Each gap fixed in the kit or recorded as a known limit. The maintainer reviews each difference
      from task 081's port: its survey, verdict, kind of port, rendering choice, and
      decisions. A better decision goes into the catalogue
- [ ] The number of runs recorded, with what stood between the replay and the one-run
      goal; meeting the goal isn't required

### Reuse and measurements
- [ ] The layering checked: no crate depends on Solid or Start, and a survey of an app
      with the same backend stack on another frontend framework (SvelteKit) reuses the
      backend recipes and lists only the framework's recipes as missing
- [ ] Recipes marked as not written yet: a replacement port, a static frame from Rust,
      the long tail as JS jobs, and server functions in Rust
- [ ] The survey's split between native and hybrid based on usage and a profile, not on
      guesses
- [ ] A first retained TypeScript job proves the job-host contract before that recipe is
      marked proven; rendering evidence alone does not satisfy it
- [ ] Capacity per machine size: how many users and organizations a ported app serves at
      task 078's load model on three Hetzner sizes, from 1 vCPU and 2 GB up, measured on
      Linux. The aim (2026-10-07) is a headline such as "one Hetzner instance this
      size could run all of a company like AMD North America"
