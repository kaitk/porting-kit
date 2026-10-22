# Development

How the repository is laid out and how a change is checked. The kit has no code to build
yet; this page grows with the first crates (snowtime-native task 081.41).

## Layout

```text
README.md        for people who use the kit
AGENTS.md        rules every agent session needs; agents/ holds rules for particular work
docs/
  architecture.md    how the kit works: goal, shape, workflow, kinds of port, what goes in
  decisions.md       the kit's own decisions, dated, with their reasons
  catalogue.md       the decisions a port reuses, with their evidence
  port-repository.md the layout a generated port has
  development.md     this page
recipes/         one recipe per library under its layer, in the format of recipes/README.md
skills/port/     the index skill a porting session loads
tasks/           the kit's own task records (tasks/README.md)
.claude/skills/  the writing review skill
```

Crates will live in `crates/`, one directory each, in a Cargo workspace at the root.

## How a port uses the kit

A porting session reads the kit from a checkout or from GitHub; nothing is installed. A
port depends on the kit's crates by git URL at an exact commit, never by branch or by a
path to a sibling checkout, so its CI and image builds can fetch them.

## Checking a change

- A recipe change reruns the recipe's "Verify" checks in a port, or says which it didn't.
- Links between docs are relative and resolve inside the repository.
- Task numbers name the repository whose records they are, unless they are the kit's
  own: "snowtime task 084", "snowtime-native task 081.41", "task 001".
