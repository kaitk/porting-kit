# Agent rules

This file holds what every session needs. `agents/` holds the rules for particular work:
read the file a task touches before starting it.

## Project context

- What this is: `README.md`; how the kit works, its workflow, and what goes in:
  `docs/architecture.md`; the layout a generated port has: `docs/port-repository.md`
- The kit's own decisions, dated, with their reasons: `docs/decisions.md`; the decisions a
  port reuses: `docs/catalogue.md`
- The port's durable documentation and maintenance workflow: `docs/port-repository.md`
- Recipes and their format: `recipes/README.md`; the entry point a porting session loads:
  `skills/port/SKILL.md`
- Layout and local setup: `docs/development.md`
- Task tracking: `tasks/` (see `tasks/README.md`)
- The first port, where recipes and crates come from: snowtime-native
  (github.com/Snowhound/snowtime-native), and its task records in `docs/tasks/`
- Rules for particular work: `agents/writing.md` (docs, recipes, tasks, and prose
  reviews)

The `port` skill is manually invoked only. Reading or editing the kit does not start its
porting workflow. A port owns its design after initialization; kit updates are optional.
Subagents for porting work require explicit user approval, even when the port itself is
authorized. Task 001 tests both initialization and maintenance by fresh sessions.

Follow the recorded decisions; if a change contradicts one, record the new decision in
`docs/decisions.md`, saying which it replaces, and update `docs/architecture.md`, in the
same change, or ask first. Record setup facts in `docs/development.md`, and environment
traps in `docs/known-issues.md` (start it with the first one), not in agent memory, so the
next agent finds them. Docs and commits name no people: date a decision or a request
(`(2026-10-22)`), write "the maintainer" where an approval or answer is needed, and
describe the setup without anyone's machine, checkouts, or home
directory. What only one machine needs goes in `CLAUDE.local.md`, which git ignores.
Measurements still name their machine. The docs must work for a developer on a clean
machine without LLM tools, and a script fetches what it needs rather than assume a
sibling checkout.

## Keep changes small

- Meet the requirement's intent with the least machinery. Before building around an
  obstacle, ask whether the requirement needs it at all.
- When a fix starts to need a new public API, a change in another repository, or a
  workaround, stop. Say so in a sentence or two, and propose the simpler reading of the
  requirement.
- A recipe, crate, or codemod enters the kit only after a port has proven it. A layer
  nobody has ported yet is marked as not written, not filled with guesses.

## Working beside other agents

- Work in a worktree of your own, on a branch from `origin/main`:
  `git worktree add ../porting-kit-<topic> -b <topic> origin/main`. Remove it once the
  branch is merged.
- Leave alone a branch, a commit, or an uncommitted change that isn't yours, in any
  checkout. Ask if it's in your way.
- Keep logs, exports, and scratch files in a directory of your own.
- Problems with your own sandbox, such as no network or no SSH, go in your report,
  not in the docs.

## Code conventions

- Comment only where the code is hard to follow without it, and say only what a reader
  of that code needs: why, a constraint, or a contract the code can't show. Don't restate
  the next line, and don't describe earlier versions or the task that added the code;
  history belongs in git.
- A crate depends on nothing app-specific: no Snowtime, Solid, or Start. What the app
  supplies comes in through a trait or configuration.

## Commits

- One lean sentence in imperative mood, at most 72 characters.
- No body, no `Co-Authored-By` or any other trailers.
- Push only when asked. Fetch and rebase before pushing.
