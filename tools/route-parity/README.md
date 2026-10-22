# Route parity check

Tells which of the app's HTTP routes a port implements. It reads the routes from the
app's own routers at run time, then calls each one on a running port without a session.
The answer to a route the port lacks is the answer to a path that can't exist under the
same prefix, so the check needs no knowledge of the port's framework.

```sh
bun <kit>/tools/route-parity/cli.ts route-parity.json --list               # the app's routes
bun <kit>/tools/route-parity/cli.ts route-parity.json --url http://127.0.0.1:3000
bun <kit>/tools/route-parity/cli.ts route-parity.json --url <url> --json report.json
```

A route is:

- **implemented** when the port answers anything else: 401 or 403 without a session, 400
  for the empty body, 200;
- **missing** when it answers 405, or exactly what it answers for a path under that
  route's prefix that can't exist (status and body, by GET and by POST);
- **inconclusive** on 429, a 5xx, or no answer.

The check fails on a missing route that isn't listed as omitted, an omitted route the
port implements after all, an omission naming a route the app doesn't have, and anything
inconclusive. The omissions, with their reasons, are the route-level part of the port's
coverage record.

It checks that a route exists, not what it does: the port's conformance and comparison
checks cover behavior, and the schema generator covers input validation.

## Config

`route-parity.json`, paths relative to it:

| Field | Meaning |
| --- | --- |
| `app` | The app's checkout. |
| `env` | Environment the app's modules need to import, such as a dummy secret and database URL. |
| `sources` | The routers: `{ "kind": "hono", "module": "file#export" }` for a Hono app, `{ "kind": "better-auth", "module": "file#export" }` for a Better Auth instance (its HTTP endpoints under its `basePath`, without server-only or disabled ones). |
| `params` | Values for path parameters by name; the rest get `x`. |
| `omitted` | Groups of `{ "reason", "routes": ["METHOD /path"] }` the port leaves out on purpose. |

A framework the readers don't cover yet (SvelteKit, Nuxt, Next.js) needs a reader in
`routes.ts` that answers method and path pairs from its route manifest.

## Test

`test/run.sh` serves a fixture Hono API's routes from a stand-in port missing one route,
and expects the check to fail without the omission and pass with it.
