---
name: port
description: Entry point for porting a TypeScript cloud app to one Rust server with SQLite using the porting kit. Use it when asked to survey, plan, or carry out such a port, or to port a new feature of the app into an existing port. Routes to the kit's recipes by layer.
---

# Porting an app with the kit

Follow the workflow in [the architecture](../../docs/architecture.md#the-workflow): survey the app,
check the findings with the user, and only then propose a port per item. Generate the port
in [the port repository's layout](../../docs/port-repository.md).

During the survey, list each library the app uses by layer, with its version and plugins.
Then look up each one below. Open the recipe only once the survey has found the library.

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
- Treat reference code as a starting point the port owns. Replace the parts marked as
  policy with the app's own rules.
