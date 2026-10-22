---
title: A Hono JSON API to Axum
layer: server
status: proven # for Snowtime's API; the server-function step before it is in the architecture
checked: 2026-10-22
applies: A JSON API on Hono with valibot schemas, mounted in TanStack Start, called by one client module
versions:
  hono: 4.13
  valibot: 1.5
  axum: 0.8.9
  rust: 1.99
evidence:
  - snowtime tasks 084 (server functions to an API) and 089 (routes per domain)
  - snowtime-native 081.02 (the API contract), 081.03 (libraries), 081.06 (server layout)
  - snowtime-native 081.26 (the functional port: 880 calls byte-equal)
---

# A Hono JSON API to Axum

The port answers the app's JSON API from Axum, byte for byte as the TypeScript server
does, so one frontend runs on either backend. An app still on server functions first
moves to an API as the
[architecture](../../docs/architecture.md#starting-from-server-functions) describes; this
recipe starts from that API.

## When it applies

The app serves a JSON API through Hono routers per domain, validates inputs and outputs
with valibot, and its client reaches the API through one module, over HTTP or in process
during a server render.

It doesn't apply as written when the client calls server functions, which first need the
middle step above; when the API streams or takes multipart bodies, which no port has done;
or when the schemas use Zod rather than valibot, whose messages differ.

## What to expect

An API action costs 8–11 times less of the app's CPU natively (081.01). Rules took 1.44
times the TypeScript's code lines with SQL strings (081.03). Snowtime's port answers 1,490
compared calls byte for byte.

## Choices for the user

1. **Which routes to port first.** Recommend the hot paths from the app's usage or a
   profile; an unported route answers 404 until it moves.
2. **Whether deliberate differences are allowed.** Snowtime's port bounds some inputs
   tighter than TypeScript (081.31). Each difference needs a decision and its own test.

## Steps

1. **One module per domain,** mirroring the app's: `routes.rs` for its `*.routes.ts`,
   `schemas.rs` for its valibot schemas, and the rules beside them.
2. **The extractors.** `InOrganization<T>`, `AsUser<T>`, and `Public<T>` do what the app's
   middleware does, in its order: check `Origin` on writes, merge path parameters with the
   query of a GET or the JSON body, decode and validate the input, check the session and
   the scope, apply rate limits, run the rule on a database lane, and map refusals and
   failures to the wire format. A route marked read-only runs on a reader.
3. **The schemas.** Each input lists its wire fields in valibot's order with valibot's
   messages, then checks the rules that span fields. A tri-state `Patch<T>` (absent, null,
   or a value) carries updates.
4. **The wire.** Outputs serialize in the TypeScript object's key order; dates as
   `Date.toJSON` writes them; errors in the app's error body.
5. **Route by route,** each run by the conformance suite and the byte comparison.
6. **In-process calls for rendering,** through `router.oneshot(request)` with the page's
   cookie; the host sets the client address, not the page.

## Pitfalls

- **Axum's own extractors answer in plain text.** `Json`, `Path`, and `Query` refuse bad
  input with their own 400 or 422. Use the custom extractors, or the byte comparison fails.
- **Key order is part of the answer.** serde writes fields in declaration order; declare
  them in the order the TypeScript object builds them.
- **Query values are strings.** A GET's numbers and booleans arrive as text, and valibot's
  coercions decide what they become.
- **`undefined` isn't `null`.** An absent field leaves a value alone and `null` removes it;
  `Option<T>` can't tell them apart.
- **Trim where valibot trims,** and count string length as JavaScript does, in UTF-16 code
  units, where it checks length.
- **A GET only reads.** A read that repairs state becomes a derived value plus an
  idempotent write (snowtime task 084).
- **Refusals answer keys, not translated text.** Schema messages that call the app's i18n
  library run in the request's locale; answer their key and parameters with an English
  message, and let the client translate ([i18n](../../docs/i18n.md)).


## Verify

- The app's conformance suite against the port, and the byte comparison of every call
  against the TypeScript server, including refusals and malformed input.
- The hardening comparison: oversized bodies, rate limits, and origin checks.

## Reference code

snowtime-native at `4dc2f0c`, in `crates/server/src/`:

| File | Lines | What it does | Generic or policy |
| ---- | ----: | ------------ | ----------------- |
| `http.rs` | 801 | The router, the extractors, and the session and scope check | Generic shape; the scope and session lookup are the app's |
| `schemas.rs` | 394 | Field validation with valibot's messages, `Patch<T>`, trimming | Generic |
| `errors.rs`, `wire.rs` | 145 | The app's error codes and the JSON answer | The shape is the app's |
| `timer/` | 254 | A small domain: routes, schemas, and rules | Example |
| `rate_limit.rs`, `rate_limit/layer.rs` | 511 | Rate limits as a tower layer, with the app's rules | Generic layer; the rules are policy |

The byte comparison is snowtime-native's `harness/compare.ts`, and the conformance runner
`harness/conformance.ts`.
