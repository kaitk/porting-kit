---
name: port
description: Manually invoked entry point for assessing, planning, or implementing a TypeScript app port with this kit, or adopting a source feature into an existing port. Use only when the user explicitly asks to run the port skill.
disable-model-invocation: true
---

# Porting an app with the kit

Start only on the user's explicit invocation. Reading a repository, discussing a port,
or reviewing this kit is not an invocation. A request to assess suitability authorizes
the survey, not implementation. Follow the user's authorized scope throughout.

Read [the workflow](../../docs/architecture.md#the-workflow). For an initial port:

1. Read the source repository's instructions, current architecture, relevant task
   history, tests, and deployment setup. Survey the app by layer, including library
   versions and plugins, client/server contracts, data, auth, rendering, jobs, and
   operational constraints. Distinguish current decisions from superseded experiments.
2. Assess suitability and whether the port is worthwhile. State what the kit covers,
   what requires investigation, and what is unsupported. Present the findings to the user.
3. Establish requirements using the architecture's question areas. Reuse answers already
   present in the repository or session. Agree scope, compatibility and deliberate
   changes, deployment and performance goals, and acceptance checks before implementation.
4. Propose a solution per area using the recipes below. Choose suitable libraries,
   crates, generators, local code, or an agreed hybrid. Explain material trade-offs and
   return to the user when evidence changes the agreed scope or approach.
5. Implement the authorized plan in checked slices. Record the source baseline and
   coverage, current architecture, decisions, experiments, and verification as work
   proceeds. Use [the port repository](../../docs/port-repository.md) for the layout and
   handover responsibilities; adapt the initial structure to the project's needs.

Subagents require explicit user approval before starting them. A port request is not
delegation approval. When authorized, use bounded tasks only where useful, and retain
their findings in the relevant port record. The workflow must also work without them.

A retained TypeScript feature is an implementation choice, not necessarily unfinished
scope. Follow the architecture's job-host constraints; page rendering does not establish
a general job runner. Mark unproven mechanisms as unproven and test a representative
feature before relying on them.

Before handover, verify the documented clean-checkout setup and required checks. Shared
behavior uses conformance and comparison; deliberate differences have explicit decisions
and tests. Leave a repository a fresh maintainer can use without this conversation.

## Working on an existing port

Start with the port's own instructions, architecture, coverage, source baseline, and
relevant experiments. Follow [the maintenance workflow](../../docs/port-repository.md#maintaining-the-port).
Adapt the requested change to the current project; do not regenerate it from the kit's
latest template. Preserve intentional differences and omitted features unless the user
changes that decision. A selected upstream change need not move the entire source pin.

Update the port's records and checks with the code. Kit updates are optional. Ordinary
maintenance does not require this skill; when the user does invoke it, its purpose is to
help the current port continue working well.

## Recipes by layer

| Layer         | Library     | Recipe                                       | Status                                                            |
| ------------- | ----------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Auth          | Better Auth | [better-auth.md](../../recipes/auth/better-auth.md) | partial: sessions, OAuth, and API keys on better-auth-rs; the rest app code |
| Database, ORM | Drizzle     | not written                                  |                                                                   |
| Server        | TanStack Start server functions, Hono | not written            | see architecture, "Starting from server functions"                 |
| Frontend      | SolidJS with TanStack Start | not written                  | see architecture, "Layers that swap independently"               |

A library missing from this table has no recipe. Say so in the survey, and don't fill the
gap with guesses. [recipes/README.md](../../recipes/README.md) describes the recipe format.

## Using a recipe

- Compare the app's versions with the recipe's `versions`. If the app is a minor version or
  more ahead, rerun the recipe's checks before trusting its verdicts.
- Put the recipe's "Choices for the user" into the check step, with its recommendations.
- Treat reference code as a starting point the port owns. Inspect its schema, runtime,
  clock, and HTTP assumptions as well as the parts marked as policy. Document which
  recipe and revision were used and what was adapted; a generic label is not a claim
  that a whole source file can be moved unchanged.
