# Recipes

A recipe tells a porting session how to port one library or layer of the app: when it
applies, which choices the user makes, the steps, what goes wrong, and how to check the
result. The [index skill](../skills/port/SKILL.md) routes a session here by layer after
the survey. The [architecture](../docs/architecture.md) and the [catalogue](../docs/catalogue.md) hold
the reasons behind the kit's choices; a recipe links to them instead of repeating them.

Recipes are Markdown so both Claude and Codex can read them, and people can review them.
Only the index is a skill, which keeps the agents' skill lists short as recipes grow
(2026-10-11).

## Layout

One recipe per library that a survey finds, under its layer: `auth/better-auth.md`, later
`database/drizzle.md` or `frontend/tanstack-start.md`. The survey names libraries and
their plugins, so a session goes straight from a survey line to its recipe. Areas inside a
library, such as Better Auth's OAuth or organizations, are sections of that recipe, each
with its own verdict (2026-10-11).

```text
recipes/
  README.md          this file
  auth/
    better-auth.md
  database/
    drizzle.md
  server/
    hono.md
```

A layer with no recipe yet has no directory. The index lists it as not written.

## Front matter

Every recipe starts with this block, so a session can tell from the first lines whether
the recipe fits and whether it's current:

```yaml
---
title: Better Auth in port-owned Rust
layer: auth
status: proven # proven, partial, or not written
checked: 2026-10-11 # the last date the steps were run against these versions
applies: Better Auth 1.7 on SQLite, with the app's schema kept
versions: # what the recipe was proven with
  better-auth: 1.7.7
evidence: # where the numbers come from
  - snowtime-native 081.28
---
```

- `proven`: every step ran in at least one port, which passed its bar.
- `partial`: some areas are proven, and the rest are marked in the recipe.
- `not written`: a placeholder that names the gap, so the survey reports it.

A session checks `versions` against the app. A major or minor version newer than the
recipe's means rerunning the recipe's checks before trusting its verdicts.

## Sections

In this order, so each recipe reads the same way:

1. **When it applies.** What the app must use, and what rules the recipe out.
2. **What to expect.** The measured outcome in the ports so far: code, binary, CPU,
   memory, and what was gained. Honest numbers, including the ones that argue against
   the recipe.
3. **Choices for the user.** The questions the session asks in the workflow's check step,
   each with the recommended answer and when to pick another one.
4. **Areas.** For a library with parts, a table of each part's verdict (the library, app
   code, or a fallback), then a section per area.
5. **Steps.** In order, each small enough to check before the next one.
6. **Pitfalls.** Findings that cost a failure to learn. Each says how it showed up, so a
   session recognizes it.
7. **Verify.** The checks that define done, and what each can't prove.
8. **Reference code.** Where the proven code lives, file by file, marking what is generic
   and what is one app's policy.

## Reference code

Until the kit extracts crates and templates, a recipe points at the port that proved it,
at an exact commit (2026-10-11). The pointer names the file, says what it does, and
marks its generic parts and its app policy, so a session knows what to copy and what to
replace. Once code moves into a kit crate or template, the recipe points there instead.

Reference code is a starting point. The generated port owns its copy.

"Generic" identifies a reusable mechanism, not a promise that a file is independent of
its original app. Name schema, runtime, clock, wire-format, and lifecycle assumptions as
well as explicit policy hooks. Separate a proven implementation from a proposed crate
boundary. A port must be able to retain its own integration code without depending on
the rest of the kit.

## What the port records

Applying a recipe leaves a short record in the port: recipe revision and tested library
versions, areas adopted or rejected, source and target locations, local configuration and
policy, deliberate differences, verification, and known gaps. Link the recipe as evidence;
keep the port's current decision and the instructions needed to maintain it locally.

For generated code, identify the inputs, generator revision and command, output files,
and ownership of later edits. For a retained TypeScript feature, include its bundle and
runtime, host contract, resource and capability limits, and tests. The general job recipe
remains unwritten until a port proves it.

When a later dependency or feature change touches the area, use the port's current
requirements to choose the checks and update the record. A new recipe version is useful
evidence to consider; it does not require the port to adopt its design. See
[maintaining the port](../docs/port-repository.md#maintaining-the-port).

## Evidence

Numbers carry their source: a port, its task record, and the commit measured. A claim
without a measurement says so. When a recipe's verdict changes, the old one doesn't
stay as history in the recipe; the port's records and git keep it.
