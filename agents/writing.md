# Writing docs, recipes, tasks, and prose

Substantial doc drafts and requested prose reviews follow
`.claude/skills/google-style/SKILL.md`; other writing follows the rules below.

- `README.md` is for people who use the kit: what it provides, how a port runs,
  concepts, the first port's numbers, and links. Process, layout, internals, and rules
  for agents go in `docs/` or `AGENTS.md` and `agents/`.
- Lead with the decision, behavior, or action, then explain why. Name the responsible
  component and use concrete facts. Cut filler and repeated summaries.
- Preserve technical meaning when editing: actors, negations, conditions, numbers,
  versions, commands, paths, and identifiers. Keep decided/proposed/open,
  implemented/planned, and must/should/can distinct. Flag contradictions instead of
  silently resolving them while copyediting.
- Record a decision with its reason and the trade-off that matters. Keep each fact in
  one place and link to it elsewhere. Use absolute dates for dated events.
- Link another repository at a commit, never at a branch, so its cleanups don't break the
  reference: a port or the source app may archive the record later.
- A number carries its source: the port, its task record, and the commit measured. A
  claim without a measurement says so.
- Match the document's format. Recipes follow `recipes/README.md`, tasks follow
  the development repository's `tasks/README.md`, with concrete acceptance criteria. Use sentence-case headings,
  backticks for code identifiers and commands, and descriptive links. Wrap prose at
  about 90 characters.
- Use prose for connected ideas, lists for steps or separate items, and tables for
  comparisons. Keep structure proportional to the content.
