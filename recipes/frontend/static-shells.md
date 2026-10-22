---
title: Static page shells, with the content rendered in the browser
layer: frontend
status: partial # the shells were built and measured in the TypeScript app; the frame from Rust is not written
checked: 2026-10-03
applies: an app whose pages are SPA-like inside a frame, where first-load content may arrive after the frame
versions:
  solid-js: 1.9.15
  "@tanstack/solid-start": 1.168.x
evidence:
  - snowtime task 079 (static route shells, built, measured, then cancelled for this app)
  - snowtime-native 081.01 (server rendering in V8, which replaced them)
---

# Static page shells, with the content rendered in the browser

Each page is an HTML file built ahead of time: everything that isn't per-user, with the
route's skeleton where per-user content goes. A CDN or the Rust host serves it, the client
fetches its data from the API and renders without hydration, and routing stays the
client's. No JavaScript runs on the server, so the port is an API server, and its memory
stays in tens of MB. The alternative is server rendering in V8
([solid-start.md](solid-start.md)); the survey asks which one the app needs
([architecture](../../docs/architecture.md#does-the-app-need-server-rendering)).

## When it applies

- The pages are SPA-like inside a frame: navigation, layout, theme, and locale are
  static or come from the session, and the content is the user's data.
- No page needs its content in the first response: no search engine or link preview
  reads it, and a skeleton then content is acceptable on first load.
- The framework can build a shell per route, so each route keeps its own skeleton, head,
  and preloads. A single SPA shell for every route loses the per-route skeleton.

It doesn't apply when the content must be in the first response, or when the warm-load
delay below is unacceptable: then render on the server.

## What to expect

Snowtime built shells for every route and measured them before and after (snowtime task
079, 2026-10-02, at 4× CPU slowdown on Fast 4G):

| | Server rendered | Shells |
|---|---|---|
| Cold load, skeleton painted | 934–1232 ms | 772–784 ms (150–460 ms sooner) |
| Cold load, content | 883–1152 ms | 2348–2433 ms, about when the old page became interactive |
| Warm load, content | 281–294 ms | 713–765 ms (430–480 ms later) |
| HTML, gzipped | — | 81–89% smaller (3.3 KB per shell) |
| Server CPU per page load | 18–52 ms rendering | 7–48 ms for the reads alone |
| Peak server RSS (TypeScript server) | 502 MB | 306 MB |

The warm-load gap is the client's first render of the page, about 280 ms at 4× slowdown
(Solid's template parsing, the visible rows, the app frame); no shell avoids it, and
embedding the reads in the HTML saves only 30–40 ms. Snowtime required "no worse with a
warm cache", so it cancelled the shells once 081.01 showed V8 in the Rust host renders a
page in 6–20 ms. An app without that requirement, or with lighter pages, may choose
otherwise: the cold load improves, and the server does much less.

## Choices for the user

- **Server rendering or shells.** Recommended: shells when no page needs its content in
  the first response and a later warm-load content time is acceptable; server rendering
  otherwise. Measure the app's own pages both ways before deciding; the client render
  cost decides it.
- **Signed-out requests.** Recommended: serve the sign-in shell at the same address and
  let the client redirect. Neither Caddy nor Vercel's routes could encode the return
  address into a redirect.
- **The frame's per-user parts** (user name, theme, locale). Recommended: from the
  client's stored copy of the settings, so the shell stays static. A Rust host that writes
  them into the HTML from the session is the "static frame from Rust" variant: not
  written yet, and it keeps those parts in step between the app and Rust.

## Steps

These are the steps task 079 took in a TanStack Start app; another framework needs its
own equivalent of steps 1 and 2.

1. Build a shell per route and language with Start's prerenderer and `defaultSsr: false`,
   so each route renders its `pendingComponent` as the skeleton with Start's own head,
   preloads, and language. Pages without per-user content, such as privacy and terms,
   prerender with their content.
2. Replace hydration with a client entry that renders (`src/client.tsx` with `render`
   instead of `hydrate`).
3. Route each page address to its shell at the edge: the Caddyfiles, and Vercel's routes
   in Nitro's `vercel.config`.
4. Replace a nonce-based content security policy with hashes of the shells' inline
   scripts, since a static file can't carry a per-request nonce.
5. Start each page's first reads early: the session read on every load, and the page's
   own reads replayed from what the last load of that address recorded the same day.
   Preload the page's own chunks, which Start's head leaves out below a route that hasn't
   loaded.
6. In the port, serve the shells as static files and answer only the API.

## Pitfalls

- A warm load gets slower even though the HTML is smaller: the content was in the old
  HTML, and the client now renders it all at once. Profile the client render before
  building, not after.
- SPA mode writes one shell for every route: the per-route skeletons are lost.
- A per-request nonce doesn't fit a static file: the policy moves to script hashes.
- Hydration has nothing to hydrate in a shell, which holds a skeleton, not the user's
  content; render instead.

## Verify

- The app's pages measured before and after, cold and warm, at a throttled CPU and
  network, with the user's thresholds agreed first.
- The app's own tests and a browser check of every page, signed in and out.
- The API conformance suite against the port, since the port now serves only the API.

## Reference code

Snowtime's branch `079-static-route-shells` (last commit `d64bd0c`) holds the shells, the
edge routes in both Caddyfiles and Vercel's routes, the hash-based policy, the early
reads, and the skeletons. It was never published, so it is not available outside the
maintainer's checkout yet. Task 079's record is in snowtime at `256ad96`,
`tasks/000-archive/079-static-route-shells.md`.
