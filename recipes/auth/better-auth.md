---
title: Better Auth to better-auth-rs
layer: auth
status: partial # sessions, OAuth, and API key creation proven on the library; the rest as app code
checked: 2026-10-11
applies: Better Auth 1.7 with its Drizzle adapter on SQLite, with the app's schema kept
versions:
  better-auth: 1.7.7
  better-auth-rs: master 9f91cd7 (2026-09-30), patched with the kit fork at 1508ab79
  rust: 1.99
evidence:
  - snowtime-native 081.39 (the library), at 2b899e6
  - snowtime-native 081.28 (every flow hand-ported), tag native-auth-081.28 at 47b74fc
  - snowtime-native auth spike (the store design and the adoption gates)
  - snowtime-native 081.40 (the library's passkey plugin mounted and compared; module kept)
---

# Better Auth to better-auth-rs

The port serves Better Auth's routes from Rust, byte for byte as the installed TypeScript
library answers them, on the app's own database rows. Sessions, cookies, and stored state
work across both backends, so a user signed in on one is signed in on the other.

The recipe uses [better-auth-rs](https://github.com/better-auth-rs/better-auth-rs) where it
matches Better Auth and keeps app code beside it where it doesn't (2026-10-08). The
library's gaps are fixed in one fork that the kit keeps, each fix is offered upstream, and
a port pins the fork until upstream has merged them all.

## When it applies

The app uses Better Auth 1.7 through its Drizzle adapter on SQLite, and the port keeps
the schema so both backends share one database file, or at least its format.

It doesn't apply as written when:

- the app's database is Postgres or MySQL: the store below is `rusqlite`, and no port has
  tried another engine;
- the app requires passkey attestation, or a user-verification policy other than
  `preferred`: the reference passkey module implements only what Snowtime uses, and the
  library's plugin hasn't been checked against such an app;
- the app stores OAuth state with the cookie strategy (`account.storeStateStrategy:
  "cookie"`): the fork matches only the database strategy, and its cookie strategy still
  writes a JWT where Better Auth encrypts;
- the app uses Better Auth plugins this recipe doesn't cover, such as two-factor, admin,
  username, magic link, or SSO. Each gets the per-area check in step 4 before the port
  plans on it. The survey reports them as not covered.

## What to expect

Measured in snowtime-native, comparing the port with every flow hand-ported (081.28) to
the same port with sign-out, OAuth, and API key creation on the library (081.39). Both pass
the same bar: 66 conformance tests with 570 assertions, 1,490 API calls byte-equal, and 17
hardening checks.

| Measure                                | Hand-ported\* | On the library | Change         |
| -------------------------------------- | ----------: | -------------: | -------------- |
| Auth code in the port, tests included  |       8,246 |          8,476 | +230 lines     |
| Fork diff the kit maintains            |           — |     +970, −320 | 21 commits     |
| Stripped Linux binary (gate)           |   80.7 MB |        84.5 MB | +4.7%          |
| API CPU per call (session, entries)    |             |                | 0%, −2.3%      |
| Load-test peak RSS                     |    48.8 MiB |       50.3 MiB | +3.1%          |
| Render harness peak RSS                |      210 MB |         231 MB | +9.9%, in band |

\* Binary and RSS: the gate's `mac` profile on 2026-10-10, baseline frozen at `5a5cb9b`
before the library went in, against the port at `20b23e7`.

The library doesn't shrink the port. It removed the hand-ported OAuth (1,370 lines),
sign-out (183), most of their schemas (about 300), and API key generation, and it added
an adapter of about 2,000 lines, mostly the store. Organizations, passkeys, and password
sign-in stay app code either way. What the library buys is that upstream maintains OAuth:
providers, protocol changes as Better Auth moves on, and fixes found by other users. That
pays off only while upstream accepts the fixes; otherwise the port owns a fork, an
adapter, and its own code.

Most of the store doesn't depend on the app. Once it moves into a kit crate, a port's own
share falls by roughly 1,000 lines.

## Choices for the user

The session asks these in the workflow's check step.

1. **The library or the hand-port, per area.** Recommend the library for sessions,
   sign-out, OAuth, and API key creation, and app code for the rest (table below). Pick
   the hand-port for everything when upstream has stopped taking fixes, when the app
   needs none of OAuth, or when binary size is tight: snowtime-native's tag
   `native-auth-081.28` is a complete hand-port with the same bar.
2. **The kit fork or upstream only.** Recommend the kit fork pinned at a commit, because
   upstream hasn't merged the fixes the byte comparison needs (see
   [the fork](#the-fork)). Upstream only means the byte comparison fails on every
   library route until those fixes land.
3. **Which OAuth providers to keep.** Each provider has its own profile mapping and a
   fake for tests. Ask whether any can go; Snowtime kept Google, GitHub, and Microsoft.
4. **Whether passwords stay scrypt.** Recommend keeping Better Auth's scrypt hashes, so
   both backends verify each other's users. better-auth-rs hashes with Argon2, so
   password sign-in stays app code.

## Areas

| Area                                 | Verdict                         | Why                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session check on every request       | App code                        | The hot path: the signed cookie verified in the app, then the session row read on a reader's lane. Better Auth's cookie cache (`session_data`) isn't ported, so every check reads the session row.                     |
| Sign-out                             | Library                         | Byte-equal after four fork fixes.                                                                                                                                                                            |
| Email and password sign-in           | App code                        | Better Auth hashes with scrypt, the library with Argon2. AWS-LC's scrypt cut sign-in p95 under load from 86–88 ms to 24–29 ms (081.08).                                                                           |
| Social sign-in, linking, callback    | Library, with fork fixes        | The library's state layer was pre-1.7; the fork matches 1.7's database strategy, plus eleven smaller fixes.                                                                                                 |
| `list-accounts`, `unlink-account`    | Library                         | Byte-equal after fork fixes: key order, `UNAUTHORIZED` when signed out, and a fresh session to unlink.                                                                                                      |
| API key creation                     | Library, through its server API | The TypeScript app creates keys only through the plugin. Its HTTP endpoints stay closed. Listing, revoking, and the per-request key check read the rows directly, as Snowtime's TypeScript does.          |
| Organizations, members, invitations  | App code                        | The library's plugin matched 38 of 141 steps of the auth-writes flow, and its roles differ: a member could remove themselves, an unknown role was saved, an admin couldn't rename the organization.          |
| Profile updates (`update-user`)      | App code                        | Kept with 081.28's organization writes (2026-10-10).                                                                                                                                                  |
| Passkeys                             | App code                        | Kept from 081.28 (2026-10-11). In 081.40 the library's plugin matched 29 of 151 passkey steps as the bar runs it, 44 with two clock mismatches worked around: 83 steps differ in format and 24 in behavior (untrimmed names, no fresh-session check, no `createSession`, the session's IP not stored, a backup-eligibility upgrade refused, Better Auth's challenges not accepted). The fixes would move about 1,000 lines into the fork rather than remove them. See [Passkeys](#passkeys). |
| Better Auth's error page             | App code                        | Not moved in 081.39.                                                                                                                                                                                         |
| Rate limits                          | App code, around the library    | The host's limits wrap `/api/auth`, and the library's own are off, so one limiter counts every request.                                                                                                      |

### Sessions and the per-request check

The app's request extractors check the session on every call: verify the signed cookie
(HMAC-SHA256 under the secret, as better-call signs it), read the session row on a reader's
lane, and renew it on the writer when Better Auth's `updateAge` says so. The library never
sees these requests. Its session plugin serves only the auth routes the app sends it, such
as sign-out.

### OAuth

The library's OAuth and account plugins serve sign-in, linking, the callback, and account
management. The app adds:

- each provider's profile mapping, as the installed Better Auth reads it. Google and
  Microsoft take the profile from the ID token of the token exchange; Microsoft's photo
  comes from Graph; GitHub's profile and email come from its API;
- the login-domain check, as a plugin mounted first, which runs after the library's origin
  checks and before every handler;
- the app's hooks as store refusals: a `user.create.before` hook becomes a refusal in
  `create_user`, which the library redirects with the hook's code and message;
- the clock: the library reads time through the fork's `time::now`, and the app sets it
  with `time::set_clock` to the host's clock, so a test clock moves both.

### API keys

The app creates a key with `auth.api_keys().create`, inside its own rule: the rule counts
the user's keys on the writer's lane, then calls the plugin, which takes the writer again
for its insert. Don't route the plugin's HTTP endpoints, and don't use `verify_api_key`
unless the TypeScript app calls `verifyApiKey`: it adds two writes to every keyed request.

### Passkeys

The library's plugin needs no extra column: the store rebuilds webauthn-rs's credential
from Better Auth's `passkey` row (COSE key, credential ID, counter, device type, backup
flag) on every read, and rows Better Auth wrote sign in through it. The plugin keeps its
challenge as a JWT cookie with webauthn-rs state in the verification row, where Better
Auth signs the cookie with better-call and stores its own JSON, so a ceremony started on
one backend can't finish on the other. The differences and the fork fixes they would
take are in snowtime-native's `docs/tasks/40-passkey-plugin.md`. The hand-ported
module stays (2026-10-11): passkeys have no providers or protocol churn for
upstream to maintain, so the plugin only moves code into the fork. Reconsider once
upstream merges the fork's open pull requests.

## Steps

1. **Pin.** Add `better-auth`, `better-auth-core`, and `better-auth-api` at upstream's
   `master` commit, and a workspace `[patch]` that points all three at the kit fork by
   `rev`. Use `default-features = false` and name the features: `rustls-no-provider` when
   the host installs its own rustls provider, `jwt-aws-lc-rs` when it uses aws-lc-rs, and
   no plugin features unless the app mounts that plugin. Allow the fork's git source in
   `deny.toml`. Record the better-auth version that upstream's compatibility harness pins.
2. **Review the dependency graph before writing code.** Run `cargo tree -i ring` and
   `cargo tree -i rsa`, then cargo-deny and cargo-audit. Neither crate should appear; if one
   does, a feature is wrong.
3. **Write the store.** Implement the library's store traits on `rusqlite`, with reads on a
   reader's lane and writes on the writer's ([reference code](#reference-code)). Stores
   for plugins the app doesn't mount refuse every call, rather than carrying SQL that
   nothing calls. Run the spike's store tests and the transaction test: commit, rollback,
   a writer deadline, and cancellation.
4. **Check each area before planning on it.** Mount the library's plugin for one area on
   a branch, run the area's byte comparison, and count the differences. A handful of
   small ones means fork fixes. Many differences, or a difference in behavior rather than
   format (roles, permissions, protocol state), means app code for that area. Decide with
   the user before porting the area.
5. **Build the bridge.** Pass the host's request to the library with the host's resolved
   client address in a header only the bridge sets, and answer a lane's refusal with the
   host's 503 and `Retry-After` instead of the library's 500.
6. **Build the library at startup,** so a configuration the library refuses stops the
   server instead of failing each request. The store holds a weak reference to the app,
   because the app holds the library and the library holds the store.
7. **Move one route at a time.** Route it to the library, run the byte comparison and the
   conformance suite, fix differences in the fork with a test each, and only then move the
   next route.
8. **Mount the policy plugin first,** with the app's hooks: input bounds, login domains,
   and anything the app's `hooks.before` does.
9. **Measure.** Run the port's performance gate against the baseline taken before the
   library went in, and record binary size, CPU, and RSS.

## Pitfalls

- **A library that claims a reference version still needs the byte comparison.**
  better-auth-rs targets better-auth 1.7.6, yet sign-out alone differed in four ways:
  error-body key order, cookie attribute order with an extra `Expires`, a repeated
  `session_data` expiry dropped as a duplicate, and malformed JSON refused after the
  origin check instead of before.
- **Check protocol state, not only responses.** The library's OAuth state (format,
  verification identifier, cookie encoding) was Better Auth's pre-1.7 design. Every
  response looked plausible, but a flow started on one backend couldn't finish on the
  other, and neither found the other's verification rows. Compare stored rows and cookies
  across backends, not only the response bodies.
- **Feature flags decide the crypto.** The `rustls` feature put ring into the app's own
  reqwest client, and the default JWT backend pulled `rsa`, which has an unfixed advisory
  (RUSTSEC-2023-0071). jsonwebtoken picks its backend at run time: with none or both
  enabled, it panics at the first signature, not at build time.
- **Unmounted plugins cost nothing in the binary.** The linker drops them (under 1 KiB
  each, by `cargo bloat`). What they cost is the dependency graph and build time: the
  plugin features remove 19 crates. The binary's growth is the OAuth and JWT code the
  port runs.
- **A trait-object store keeps all its code.** The store is `dyn`, so SQL for an unmounted
  plugin stays in the binary. Refuse those calls instead: Snowtime's organization SQL
  was 0.3 MiB.
- **The library passes some integer columns as `f64`,** such as an API key's rate window.
  Bind them as integers, as Better Auth's adapter stores them.
- **Better Auth writes a missing JSON column as the text `'null'`,** not SQL `NULL`. A
  store that writes `NULL` breaks byte-equal reads on the TypeScript side.
- **The order of clock reads shows up in data.** The library read an API key's creation
  time after its expiry, so a 30-day key could come out a millisecond short. The fork
  reads them in Better Auth's order.
- **An async transaction holds the writer.** The lane's admission deadline doesn't bound
  how long a library callback keeps it once admitted. Give transactions their own
  deadline (Snowtime: 5 s).
- **Every expiry check must use the library's clock.** With a test clock set through
  `time::set_clock`, the passkey plugin still checks its challenge JWT's `exp` against the
  system clock (`jsonwebtoken`'s validation), and so do the OAuth cookie state, admin, and
  the session cookie cache. A store that filters expired rows with `Utc::now()` has the
  same bug, and it stays hidden until a mounted plugin calls that method. Use
  `better_auth_core::time::now()` in the store.
- **The passkey plugin refuses an IP address as the RP ID,** and Better Auth accepts it.
  A harness that serves on `127.0.0.1` gets 500 from every options call; serve on
  `localhost` or fix the check in the fork.
- **The library's own rate limiting double-counts** when the host already limits
  `/api/auth`. Turn it off.

## Verify

- The app's conformance suite against the port, and the byte comparison of every auth
  call against the TypeScript server, both run after each moved route.
- The library's own compatibility harness at the pinned commit: `full_client_compat` and
  `configuration_client_compat`, after `bun install` in both `compat-tests` directories.
- Cross-backend flows: start an OAuth flow on one server and finish it on the other; sign
  in on one and call the other.
- cargo-deny and cargo-audit with the port's features, and `cargo tree -i` for ring and
  `rsa`.
- The performance gate against the pre-library baseline.

What these can't prove: live consent screens, registered redirect URLs, and real
provider tokens. The fake OAuth provider stands in for Google, GitHub, and Microsoft, and
the software passkey authenticator for real devices.

## The fork

The kit keeps one fork, [`kaitk/better-auth-rs`](https://github.com/kaitk/better-auth-rs),
for every port, because its fixes are about matching Better Auth, not about one app (2026-10-11). Its branch `snowtime` carries every fix on upstream's `master`. Each fix
offered upstream also has its own branch on `master`, with tests, in upstream's
conventional-commit style.

As of 2026-10-11, upstream has seven pull requests from the fork and one issue:

| Upstream            | Fix                                                                     |
| ------------------- | ----------------------------------------------------------------------- |
| #119                | `rustls-no-provider` TLS feature                                        |
| #120                | Error bodies in better-auth's key order                                 |
| #121                | Cookies in better-call's attribute order, without `Expires`             |
| #122                | Sign-out expires a received `session_data` cookie twice                 |
| #123                | Malformed JSON refused before the origin check                          |
| #124                | JWT crypto backend as a feature (`jwt-rust-crypto`, `jwt-aws-lc-rs`)    |
| #125                | Two-factor, passkey, and device authorization as optional features      |
| Issue #126          | OAuth state follows the pre-1.7 protocol; asks before splitting the OAuth fixes into PRs |

The fork also carries OAuth fixes waiting on the issue's answer, an API key creation-time
fix, and a compat-server change. Keeping the fork:

- Rebase `snowtime` on upstream's `master` when a port moves its pin, run upstream's
  `scripts/check.sh`, and drop each fix once upstream merges it.
- A new fix gets a test, its own branch on `master`, and a pull request written plainly:
  the problem as the port hit it, the change, and one line on the checks.
- A port pins the fork by commit, never by branch.

## Reference code

snowtime-native at `2b899e6` (branch `081.39-better-auth-rs`), in
`crates/server/src/auth/`. Generic means it ports to another Better Auth app on SQLite
unchanged or with names swapped; policy means it is Snowtime's and gets replaced.

| File                       | Lines | What it does                                                                                                     | Generic or policy                                                                                                                                                                           |
| -------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `library/store.rs`         | 1,080 | The library's store traits on `rusqlite`, on the host's lanes                                                    | Generic: lanes, column mapping, `f64` binds, `'null'` metadata, verification lookups, refusing stores. Policy: `create_user` and `create_session` hooks (login domains, unverified sign-ups) |
| `library/transaction.rs`   |   129 | Async transactions on a dedicated writer, with their own deadline                                                | Generic                                                                                                                                                                                     |
| `library/bridge.rs`        |   179 | Host request in, library response out; a lane's refusal kept and answered as the host's 503                       | Generic, apart from the client-address header's name                                                                                                                                       |
| `library/mod.rs`           |   150 | Builds the library: config, clock, plugins, API key options, the schema with a session that has no `active` column | Mixed: the build is generic; the options are Snowtime's                                                                                                                                     |
| `library/policy.rs`        |   142 | A plugin mounted first, for the app's `hooks.before`                                                             | The plugin shape is generic; input bounds and login domains are policy                                                                                                                      |
| `library/providers.rs`     |   157 | Google, Microsoft, and GitHub profiles as Better Auth 1.7.7 reads them, and the fake provider's transport         | Generic per provider                                                                                                                                                                        |
| `library/tests.rs`         |   182 | Store and transaction tests                                                                                      | Generic                                                                                                                                                                                     |
| `cookie.rs`                |   109 | better-call's signed cookies                                                                                     | Generic                                                                                                                                                                                     |
| `session.rs`               |   280 | The session row and its per-request check, with renewal                                                          | Generic; the 30-day and daily renewal settings are the app's                                                                                                                                |
| `password.rs`              |    90 | Better Auth's scrypt hashes on AWS-LC                                                                            | Generic                                                                                                                                                                                     |
| `sign_in.rs`               |   472 | `/sign-in/email`: verify the hash off the database lane, write the session, set the cookie                       | Generic flow, with the app's options                                                                                                                                                        |
| `callback_urls.rs`         |   101 | Better Auth's checks of callback URLs, for routes still app code                                                 | Generic                                                                                                                                                                                     |
| `rate_limit.rs`            |    80 | Better Auth 1.7.7's route limits plus the app's custom rules                                                     | Generic rules; custom rules are policy                                                                                                                                                      |
| `passkeys.rs`              |   927 | Registration, sign-in, listing, and removal on `webauthn-rs-core` with the `preferred` policy                     | Generic for apps without attestation                                                                                                                                                        |
| `error_page.rs`            |   486 | Better Auth 1.7.7's error page with default options                                                              | Generic                                                                                                                                                                                     |
| `writes.rs`, `invitations.rs`, `acceptance.rs` | 1,683 | Organization, member, invitation, and profile writes as Better Auth's organization plugin answers them | Generic flows with Snowtime's roles and validation                                                                                                                                          |

Test tools: the fake OAuth provider in the app's `conformance/oauth-flow.ts` (Snowtime
`main`), and the software passkey authenticator in the app's
`conformance/passkey-authenticator.ts`. The byte comparisons for auth are in `harness/`:
`oauth-compare.ts`, `passkey-compare.ts`, `auth-writes-compare.ts`, `api-keys-compare.ts`,
and `login-domains-compare.ts`.
