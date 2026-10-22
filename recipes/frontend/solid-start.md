---
title: Solid with TanStack Start, rendered in V8
layer: frontend
status: proven # for Snowtime's pages: V8 embedded in the host; the Bun sidecar parked
checked: 2026-10-22
applies: SolidJS with TanStack Start, server-rendered and hydrated, its pages reading the app's JSON API
versions:
  solid-js: 1.9.16
  "@tanstack/solid-start": 1.168.57
  deno_core: 0.405 (V8 149.4)
  rust: 1.99
evidence:
  - snowtime-native 081.01 (server rendering), 081.14 and 081.19–081.22 (render CPU)
  - snowtime-native 081.16 (JavaScriptCore and the Bun sidecar, parked), 081.18 (newer V8)
  - snowtime task 079 (static shells, rejected)
---

# Solid with TanStack Start, rendered in V8

The port renders the app's pages with the app's own server bundle, in V8 isolates inside
the Rust host, and the browser hydrates them with the app's unchanged client build. The
bundle's API calls reach the port's router in process. Whether pages need server rendering
at all is the survey's question ([architecture](../../docs/architecture.md#does-the-app-need-server-rendering)).

## When it applies

The app is SolidJS on TanStack Start, its pages are finite (rendered whole, not streamed
in parts the client relies on), and its server code past rendering reaches data only
through the API.

It doesn't apply as written to other frameworks, which need their own adapter
([layers](../../docs/architecture.md#layers-that-swap-independently)), or to pages that
call server functions or Node APIs directly.

## What to expect

A rendered page costs 1.5–2 times less of the app's CPU than on the TypeScript server
(081.01). With one renderer the server peaks at about 220 MB RSS under load; each further
renderer adds about 50 MiB. V8 renders at 1.21–1.30 times Bun's CPU after the bundle work
in 081.19–081.22; a Bun sidecar would save 17–23% of render CPU, at the cost of child
processes to start, confine, and restart, and stays parked behind the same interface.

## Choices for the user

1. **Server rendering, a static frame, or the API alone.** Recommend server rendering
   only where content on first load matters; a frame from Rust saves most of the memory
   ([architecture](../../docs/architecture.md#does-the-app-need-server-rendering)).
2. **The memory budget.** Renderers are sized from it; ask what the host may use.

## Steps

1. **The adapter,** in the port, running on the app's own toolchain from its
   `node_modules`: build the server bundle with route components split as in the client
   build, stub what the server bundle mustn't reach, and minify to ASCII only.
2. **The snapshot.** Load the bundle and the bootstrap into a `deno_core` startup
   snapshot, with Deno's web extensions and `deno_fetch`'s scripts for Headers, Request,
   and Response, and no network extension, so page code can't open a socket.
3. **The pool.** One isolate per renderer thread, each with its own current-thread Tokio
   runtime; size the pool from the memory limit and the CPUs; a bounded queue that
   answers 503 when full or waited too long; a watchdog for synchronous JavaScript and a
   deadline for API calls.
4. **In-process API calls.** The bootstrap's fetch goes to the host's router through
   `oneshot`, with the page request's cookie and client address attached by the host;
   pages may only read.
5. **Serve the client build** and pass its manifest, so hydration finds its assets.
6. **Compare pages:** the byte comparison of rendered HTML against the TypeScript server,
   then a hydration check in a browser.

## Pitfalls

- **A non-Latin-1 character doubles the bundle's memory.** V8 keeps a source with one
  character above U+00FF as two bytes per character. Minify to ASCII only (081.22).
- **Solid's getter props drive garbage collection.** V8 keeps the `AccessorPair`s behind
  them in old space; shared descriptors (`RENDER_PROPS=shared`) took 3–22% off render CPU
  on V8 and cost Bun 10–21%, so the choice is per engine (081.20).
- **Young-generation size matters.** A 16 or 32 MiB semi-space lets a page fit in V8's
  young generation: 20–50 MB per renderer for 3–11% less render CPU (081.14).
- **Start addresses server functions by a build hash.** A port can't call them stably;
  move them to the API first (081.02).
- **A newer V8 isn't automatically faster.** V8 150.4 left the costly GC behaviors
  unchanged (081.18); measure each upgrade with the gate.
- **Engines that rendered but lost:** JavaScriptCore (memory, unstable embedding, LGPL),
  SpiderMonkey (memory, startup), QuickJS (needs Intl polyfills, too slow), Boa (error
  pages), Perry (didn't compile the bundle).

## Verify

- The page byte comparison against the TypeScript server, for every page, signed in and
  out.
- Hydration in a browser without console errors.
- The performance gate's render rows: CPU, p50, p95, and peak RSS per page.

## Reference code

snowtime-native at `4dc2f0c`:

| Path | What it does | Generic or policy |
| ---- | ------------ | ----------------- |
| `adapter/` | The bundle build, stubs, bootstrap, shared props, and the ASCII minify | Template; the stubs and routes are the app's |
| `crates/render/` | The renderer pool, snapshot, extensions, watchdog, and memory sizing ([README](https://github.com/Snowhound/snowtime-native/blob/main/crates/render/README.md)) | Generic, with the adapter's interface |
| `crates/host/src/pages.rs` | The page handler and in-process API calls | Generic shape |
| `crates/host/src/memory.rs` | Renderer count and heap limits from the memory limit | Generic |
| `harness/page-compare.ts` | The page byte comparison | Generic |
