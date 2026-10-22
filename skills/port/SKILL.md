---
name: port
description: Manually invoked entry point for assessing, planning, or implementing a TypeScript app port with this kit, or adopting a source feature into an existing port. Use only when the user explicitly asks to run the port skill.
disable-model-invocation: true
---

# Porting an app with the kit

Run only on the user's explicit request. A request to assess a port authorizes the survey,
not the port. Subagents need the user's explicit approval; approving the port doesn't
approve delegation.

## A new port

Follow [the workflow](../../docs/architecture.md#the-workflow): survey the app by layer,
give a fit verdict, agree the requirements with the user, propose per area, then build in
checked slices. Lay out and hand over the port as
[the port repository](../../docs/port-repository.md) says; the handover must let a fresh
session maintain it without this conversation or the kit.

## An existing port

Start from the port's own records, not the kit's latest template. Follow
[maintaining the port](../../docs/port-repository.md#maintaining-the-port), and keep its
deliberate differences and omissions unless the user changes them.

## Recipes by layer

| Layer         | Library     | Recipe                                              | Status                                                                 |
| ------------- | ----------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Auth          | Better Auth | [better-auth.md](../../recipes/auth/better-auth.md) | proven for Snowtime's scope: port-owned compatibility code, no library |
| Database, ORM | Drizzle     | [drizzle.md](../../recipes/database/drizzle.md)     | proven for SQLite in-process: `rusqlite` with SQL strings, Drizzle's migrator |
| Server        | TanStack Start server functions, Hono | not written               | see architecture, "Starting from server functions"                     |
| Frontend      | SolidJS with TanStack Start | not written                 | see architecture, "Layers that swap independently"                     |

A library missing here has no recipe: say so in the survey rather than guess. Before
trusting a recipe, compare the app's versions with its `versions` and put its "Choices
for the user" into the requirements step.
