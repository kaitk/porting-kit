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

A user explicitly asks a session to read the port skill from a checkout or from GitHub.
No global installation is required. Merely finding this repository does not start a port.
If installed into an agent's skill discovery, preserve its manual-invocation settings:
`skills/port/agents/openai.yaml` sets `allow_implicit_invocation: false` for Codex, and
`SKILL.md` sets `disable-model-invocation: true` for Claude Code, as described in
[Claude Code's skill reference](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill).
Do not install or enable the skill in the user's environment without a request.

A port records the kit revision used. It depends on any selected kit crates by git URL
at an exact commit, never by branch or by a path to a sibling checkout, so CI and image
builds can fetch them. The port's documented build and maintenance process works without
adopting a later kit revision. Source-app pins, kit provenance, and dependency pins have
different purposes; see [the port repository](port-repository.md).

## Checking a change

- A recipe change reruns the recipe's "Verify" checks in a port, or says which it didn't.
- Links between docs are relative and resolve inside the repository.
- Task numbers name the repository whose records they are, unless they are the kit's
  own: "snowtime task 084", "snowtime-native task 081.41", "task 001".
- A documentation change checks the skill, README, architecture, decision record, and
  acceptance criteria for conflicting requirements. Preserve the difference between a
  decision, a proposal, a proven recipe, and a planned experiment.
- Validate skill YAML and local links. The port skill uses a Claude-specific frontmatter
  field as well as Codex's invocation policy; a validator accepting only common skill
  fields must check that extension separately. Structural checks do not replace the
  manual-invocation and fresh-session checks in task 001.
