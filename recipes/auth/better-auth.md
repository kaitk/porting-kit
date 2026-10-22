---
title: Better Auth in port-owned Rust
layer: auth
status: proven # for Snowtime's scope: the areas below; other plugins and providers not written
checked: 2026-10-22
applies: Better Auth 1.7 with its Drizzle adapter on SQLite, with the app's schema kept
versions:
  better-auth: 1.7.7
  rust: 1.99
evidence:
  - snowtime-native 081.28 (every flow hand-ported), tag native-auth-081.28 at 47b74fc
  - snowtime-native 081.42 (back on the hand-port after the library trial)
  - snowtime-native 081.39 and 081.40 (better-auth-rs tried and measured)
---

# Better Auth in port-owned Rust

The port serves Better Auth's routes from Rust, byte for byte as the installed TypeScript
library answers them, on the app's own database rows. Sessions, cookies, and stored state
work across both backends, so a user signed in on one is signed in on the other.

The code is the port's own, starting from snowtime-native's hand-port (tag
`native-auth-081.28`), and later from the kit's crates once they are extracted.
[better-auth-rs](https://github.com/better-auth-rs/better-auth-rs) is a reference to read
and borrow from with attribution, not a dependency
([decision](../../docs/decisions.md#the-kit-owns-its-better-auth-compatibility-code)).

## When it applies

The app uses Better Auth 1.7 through its Drizzle adapter on SQLite, and the port keeps
the schema so both backends share one database file, or at least its format.

It doesn't apply as written when:

- the app's database is Postgres or MySQL: the SQL is `rusqlite`'s, and no port has tried
  another engine;
- the app requires passkey attestation, or a user-verification policy other than
  `preferred`: the passkey module implements only what Snowtime uses;
- the app stores OAuth state with the cookie strategy (`account.storeStateStrategy:
  "cookie"`): only the database strategy is ported;
- the app uses OAuth providers other than Google, GitHub, and Microsoft, or ID-token
  sign-in: each provider needs its profile mapping and a fake for tests;
- the app uses Better Auth plugins this recipe doesn't cover, such as two-factor, admin,
  username, magic link, or SSO. The survey reports them as not written.

## What to expect

snowtime-native's auth, every flow hand-ported, is 8,246 lines with tests, and passes the
full bar: 66 conformance tests with 570 assertions, 1,490 API calls byte-equal, and 17
hardening checks.

better-auth-rs was tried for sessions, sign-out, OAuth, and API key creation (081.39) and
passkeys (081.40), against the same bar:

| Measure                               | Hand-ported | On the library | Change         |
| ------------------------------------- | ----------: | -------------: | -------------- |
| Auth code in the port, tests included |       8,246 |          8,476 | +230 lines     |
| Fork diff to match Better Auth        |           — |     +970, −320 | 21 commits     |
| Stripped Linux binary (gate)          |     80.7 MB |        84.5 MB | +4.7%          |
| Load-test peak RSS                    |    48.8 MiB |       50.3 MiB | +3.1%          |
| Render harness peak RSS               |      210 MB |         231 MB | +9.9%          |

The gate's `mac` profile on 2026-10-10, baseline `5a5cb9b`, against the port at `20b23e7`.
The library's organization plugin matched 38 of 141 steps, and its passkey plugin 44 of
151. Its v1.0.0-alpha.5 then required the system ICU library and changed the store
traits the adapter implemented. So the port owns this code either way; owning all of it
avoids a fork and an adapter on top.

Owning it means Better Auth's protocol changes are the port's to follow. Between 1.7.6
and 1.7.7, the Google, GitHub, and Microsoft providers and the OAuth routes didn't change,
but the stored OAuth state did (`auth-state:<state>`, purpose-derived cookie keys). The
byte comparison catches such changes when the source pin moves.

## Choices for the user

The session asks these in the requirements step.

1. **Which OAuth providers to keep.** Each provider has its own profile mapping and a
   fake for tests. Ask whether any can go; Snowtime kept Google, GitHub, and Microsoft.
2. **Whether passwords stay scrypt.** Recommend keeping Better Auth's scrypt hashes, so
   both backends verify each other's users; AWS-LC's scrypt cut sign-in p95 under load
   from 86–88 ms to 24–29 ms (081.08).
3. **Whether the session cookie cache stays off.** Snowtime's port reads the session row
   on every check, since the database is local, which makes revocation immediate. Keep it
   off unless the app depends on `session_data`.

## Areas

| Area                                | Notes |
| ----------------------------------- | ----- |
| Session check on every request      | The signed cookie verified (HMAC-SHA256, as better-call signs it), then the session row read on a reader's lane; renewal on the writer when `updateAge` says so, skipped when the writer is busy. |
| Email and password sign-in          | Scrypt verified off the database lane, then the session written and the cookie set. |
| Sign-out                            | Expires `session_data` twice when it was received, as Better Auth does. |
| Social sign-in, linking, callback   | 1.7's database state strategy: `auth-state:<state>` rows with `oauthState`, a signed `state` cookie, and a 128-character PKCE verifier. |
| `list-accounts`, `unlink-account`   | `UNAUTHORIZED` when signed out; unlinking needs a fresh session. |
| API keys                            | Created as `@better-auth/api-key` creates them, with the app's options; the per-request key check reads the rows directly, as the TypeScript app does. |
| Organizations, members, invitations | Better Auth's organization plugin's answers, with the app's roles and validation. |
| Profile updates (`update-user`)     | With the organization writes. |
| Passkeys                            | `webauthn-rs-core` with the `preferred` policy; Better Auth's `passkey` rows and challenges, so a ceremony started on one backend finishes on the other. |
| Better Auth's error page            | 1.7.7's page with default options. |
| Rate limits                         | Better Auth 1.7.7's route limits plus the app's custom rules, in the host. |

## Steps

1. **Start from the reference code** ([below](#reference-code)), or the kit's crates once
   they exist. Replace the parts marked as policy with the app's rules.
2. **Sessions first.** Cookies, the session check, and scrypt, with the app's expiry and
   renewal settings. Every other area depends on them.
3. **One area at a time.** Port an area, run its byte comparison and the conformance
   suite, and fix each difference with a test before the next area.
4. **Check stored state across backends.** Start a flow on one server and finish it on the
   other; sign in on one and call the other.
5. **Measure** with the port's performance gate.

## Pitfalls

- **Check protocol state, not only responses.** better-auth-rs's OAuth state followed
  Better Auth's pre-1.7 design: every response looked plausible, but a flow started on
  one backend couldn't finish on the other. Compare stored rows and cookies across
  backends, not only response bodies.
- **Byte order is behavior.** Error bodies write `message` before `code`, and cookies
  write `Max-Age; Path; HttpOnly; Secure; SameSite` with no `Expires`, as better-call
  does. A library claiming a Better Auth version still differed in both.
- **Malformed JSON is refused before the origin check,** with 400 `BAD_REQUEST`.
- **Better Auth writes a missing JSON column as the text `'null'`,** not SQL `NULL`. A
  port that writes `NULL` breaks byte-equal reads on the TypeScript side.
- **Some integer columns arrive as floats,** such as an API key's rate window. Bind them
  as integers, as Better Auth's adapter stores them.
- **The order of clock reads shows up in data.** Reading an API key's creation time after
  its expiry made a 30-day key a millisecond short. Read them in Better Auth's order.
- **Every expiry check uses the port's clock,** so a test clock moves sessions, OAuth
  state, and passkey challenges together.
- **An IP address as the passkey RP ID:** Better Auth accepts it, and a harness on
  `127.0.0.1` relies on that.
- **One rate limiter.** The host's limits wrap `/api/auth`; don't add a second limiter
  inside auth.

## Verify

- The app's conformance suite against the port, and the byte comparison of every auth
  call against the TypeScript server.
- Cross-backend flows: OAuth started on one server and finished on the other; sign-in on
  one and calls to the other.
- The performance gate against the port's baseline.

What these can't prove: live consent screens, registered redirect URLs, and real
provider tokens. The fake OAuth provider stands in for Google, GitHub, and Microsoft, and
the software passkey authenticator for real devices.

## Reference code

snowtime-native at tag `native-auth-081.28`, in `crates/server/src/auth/`. These are
proven implementations, not standalone crates: review each file's schema, runtime, clock,
and HTTP assumptions before adapting it. Policy is the source app's choice and must be
checked against the new app's requirements.

| File                         | Lines | What it does | Generic or policy |
| ---------------------------- | ----: | ------------ | ----------------- |
| `cookie.rs`                  |   109 | better-call's signed cookies | Generic |
| `session.rs`                 |   280 | Session lookup, creation, and renewal | Reusable; schema columns, writer scheduling, expiry, cookie settings, timestamps, IDs, and user-agent bounds are integration choices |
| `password.rs`                |    90 | Better Auth's scrypt hashes on AWS-LC | Generic; benchmark counters stay in the host |
| `app_session.rs`             |   156 | The session as the app's API reads it | Mixed |
| `sign_in.rs`                 |   472 | `/sign-in/email` | Generic flow, with the app's options |
| `sign_out.rs`                |   183 | `/sign-out`, and Better Auth's callback URL checks | Generic |
| `oauth.rs`                   | 1,370 | Social sign-in, linking, callback, account listing and unlinking, Google, GitHub, and Microsoft profiles | Generic per provider; allowed domains are policy |
| `api_keys.rs`                |   273 | API key creation, listing, revoking, and the key check | Generic flows with the app's options |
| `passkeys.rs`                |   927 | Registration, sign-in, listing, and removal | Generic for apps without attestation |
| `writes.rs`, `invitations.rs`, `acceptance.rs`, `organization.rs` | 1,711 | Organization, member, invitation, and profile writes | Generic flows with Snowtime's roles and validation |
| `error_page.rs`              |   486 | Better Auth 1.7.7's error page | Generic |
| `rate_limit.rs`              |    80 | Better Auth 1.7.7's route limits plus custom rules | Generic rules; custom rules are policy |
| `login_domains.rs`, `bounds.rs` | 192 | Login domains and input bounds | Policy |
| `schemas.rs`, `ordered_json.rs` | 1,194 | Request and response shapes in Better Auth's key order | Generic |

Test tools: the fake OAuth provider in the app's `conformance/oauth-flow.ts`, and the
software passkey authenticator in `conformance/passkey-authenticator.ts`. The auth byte
comparisons are in snowtime-native's `harness/`: `oauth-compare.ts`, `passkey-compare.ts`,
`auth-writes-compare.ts`, `api-keys-compare.ts`, and `login-domains-compare.ts`.
