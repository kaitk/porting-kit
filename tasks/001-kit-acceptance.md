# 001: The kit's acceptance criteria

Status: in-progress

The kit is done when a fresh session ports an app with it, and the crates and layering
hold up on a second app.

## Acceptance criteria

- [ ] Recipes written only for steps proven in task 081's port
- [ ] [The catalogue](../docs/catalogue.md) written, one entry per decision, with its
      evidence
- [ ] The crates in [architecture](../docs/architecture.md#what-goes-in) extracted from task 081's port, with their tests, and the port
      using them
- [ ] Codemods only for conversions done by hand at least once, with their tests
- [ ] The workflow in [architecture](../docs/architecture.md#the-workflow) written as the repository's entry point: the survey with the
      kind of port and the verdict, the user's check, then proposals
- [ ] The transferability check for server functions written as a recipe, which on this
      app's 41 gives task 084's table, and the middle step to the API written as a recipe
      from task 084
- [ ] A fresh AI session, with only the repository, ports this app from its
      server-function baseline (before task 084: the first parent of `2f13db0`), and its
      result passes the conformance tests and byte comparison. The replay records its
      runs, what the user did between them, and each gap it hit
- [ ] Each gap fixed in the kit or recorded as a known limit. The maintainer reviews each difference
      from task 081's port: its survey, verdict, kind of port, rendering choice, and
      decisions. A better decision goes into the catalogue
- [ ] The number of runs recorded, with what stood between the replay and the one-run
      goal; meeting the goal isn't required
- [ ] The layering checked: no crate depends on Solid or Start, and a survey of an app
      with the same backend stack on another frontend framework (SvelteKit) reuses the
      backend recipes and lists only the framework's recipes as missing
- [ ] Recipes marked as not written yet: a replacement port, a static frame from Rust,
      the long tail as JS jobs, and server functions in Rust
- [ ] The survey's split between native and hybrid based on usage and a profile, not on
      guesses
- [ ] Capacity per machine size: how many users and organizations a ported app serves at
      task 078's load model on three Hetzner sizes, from 1 vCPU and 2 GB up, measured on
      Linux. The aim (2026-10-07) is a headline such as "one Hetzner instance this
      size could run all of a company like AMD North America"
