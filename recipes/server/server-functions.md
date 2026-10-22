---
title: TanStack Start server functions to a JSON API
layer: server
status: proven # Snowtime's 41 server functions moved, in the TypeScript app, before any Rust
checked: 2026-10-22
applies: TanStack Start server functions called by a client, moved to a JSON API in the same app
versions:
  "@tanstack/solid-start": 1.168
  hono: 4.13
  valibot: 1.5
evidence:
  - snowtime task 084 (the move, the seam, and the measurements)
  - snowtime task 089 (Hono routes per domain)
  - snowtime-native 081.02 (why a Rust port can't serve server functions)
---

# TanStack Start server functions to a JSON API

The middle step before a port: the TypeScript app keeps working and gains a JSON API that
both backends can serve, then drops its server functions. The Rust port then follows
[the Hono recipe](hono.md). A Rust server can't serve Start's server functions stably:
Start addresses them by a build hash, over a private protocol (081.02).

## When it applies

The app's client calls `createServerFn` functions, and the owner agrees to change the
TypeScript app first. It doesn't apply as written to functions that stream, return a raw
`Response`, take `FormData`, or return JSX; the transferability check marks those.

## What to expect

The API cost no more than server functions in snowtime task 084: the same CPU per read
under load, 0.1–0.2 ms sooner one call at a time, and 1.4× fewer gzipped bytes, since
Start's serializer tags every value. Snowtime moved 41 functions in 9 files.

## Choices for the user

1. **Whether the app may change first.** Recommend yes: the port is then a second server
   for one contract, and the conformance suite runs against both. Without it, see the
   hybrid "server functions served from Rust" in
   [hybrids](../../docs/hybrids.md).
2. **How long server functions stay.** Recommend only as a bridge while calls move.

## Steps

1. **Check transferability per function** ([architecture](../../docs/architecture.md#starting-from-server-functions)).
   Check outputs as well as inputs: a function that selects `getTableColumns(table)` or
   uses a bare `.returning()` leaks audit columns into its answer, and needs changes.
   Write the report with each function's verdict and proposed call; it is the first
   commit.
2. **The seam.** One client module with `call(name, input)` and a pluggable transport:
   HTTP in the browser, and in-process during a server render, so a loader's read makes no
   request to itself. A list of operations: method, path, scope (organization, user, or
   public), and input and output schemas.
3. **Rules shaped `(db, scope, input)`,** which both the server function and the API
   call, returning only the contract's fields.
4. **Output schemas.** Dates travel as ISO strings and are revived by the schemas; errors
   as `{ error: { code, key } }` with a status from the code.
5. **Conformance tests over HTTP,** one file per domain, runnable against any backend by
   URL.
6. **Move one domain at a time,** then delete the server functions, the serialization
   adapters, and middleware nothing else needs.

## Pitfalls

- **A GET only reads.** A read that repairs state, such as saving a fallback active
  organization, setting a cookie, or creating a missing row, becomes a derived value plus
  an idempotent write. The auth library's sliding session is the accepted exception.
- **GET inputs are strings.** Query values lose their types; the schemas revive dates and
  booleans. Nested filters don't fit a query string.
- **A GET with a body fails at the edge.** Vercel answered 405 before the function ran. A
  read with a large or nested input becomes a POST marked read, which skips the `Origin`
  check and the write rate limit like a GET.
- **Signed-out calls need a scope.** Some functions run without a session; give the
  contract a `public` scope whose handler gets the session or null.
- **Request-scoped implicit state becomes explicit.** Values a function reads from
  `AsyncLocalStorage` or the request, such as the audit actor or headers forwarded to the
  auth library, become handler parameters, since the Rust port has no implicit context.
- **Auth library calls with the request's headers.** Pass the caller's headers through
  the handler, and the page's through the in-process transport.

## Verify

- The conformance suite against the TypeScript API.
- Hydration equality: the cache a server render dehydrates equals what the HTTP transport
  decodes for the same reads.
- The app's own tests and a browser check of every page.

## Reference code

Snowtime (github.com/Snowhound/snowtime) at `b41e081`, where task 084 closed:
`src/lib/api/client.ts`, `transports.ts`, `wire.ts`, and `operations.ts`; `src/server/operations.server.ts` and
`api.server.ts`; and `conformance/`. The transferability report is task 084's
"Transferability" section in `tasks/000-archive/084-server-functions-or-api.md`.
