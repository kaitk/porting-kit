# 002: Review the first crate boundaries against port ownership

Status: in-progress (review recorded 2026-10-22; the three crates agreed the same day)

Review the three-crate proposal in snowtime-native task 081.41 against the kit's goal:
initialize a well-founded port that can maintain and change its own design. The
recommendations below are proposals, not approved API designs or completed extraction.
Implementation remains in snowtime-native task 081.41 with that port as the first consumer.

The review was written while the third crate was still a better-auth-rs storage adapter.
On 2026-10-22 the kit chose to own its Better Auth compatibility code instead
([decision](../docs/decisions.md#the-kit-owns-its-better-auth-compatibility-code)), so the
third crate holds 081.28's hand-ported handlers. The sections below are updated for that.

## Recommendation

Keep three crates in one workspace: the lane, Better Auth sessions, and Better Auth
compatibility. Admission/execution, sessions, and the auth handlers have different
consumers and dependency lifecycles.
Coordinated early releases are convenient, but must not require a port to adopt all three
or upgrade unrelated pieces together. A single crate with features is not needed to
share a repository. Narrow features can still be useful within each crate.

The extraction is a supporting task. Its success includes preserving the port's runtime
behavior, verification, and freedom to replace components, not only moving lines out of
snowtime-native. Keep the port's policy and composition ordinary local code.

## Admission and execution

Keep `admission.rs` and `lane.rs` together, with admission usable separately. Other callers
need a gate without submitting a job. Keep the crate on Tokio and the standard library;
it should not depend on SQLite, auth, Axum, or the app's wire format.

Return a crate-owned execution/refusal error. The port maps busy work to its 503 body and
`Retry-After`, and worker failure to its failure response. Preserve count and time bounds,
one deadline across multiple admissions, withdrawal before execution, and permit retention
until running work finishes after caller cancellation.

An exposed `run_admitted` needs a contract that a permit belongs to that lane. The
existing app-private assumption should not become an unchecked public capacity bypass.
Queue sizes, hash priority and sizing, and report policy remain host decisions.
Observability can use a small hook or a plain statistics value; app benchmark globals
and JSON output stay outside the crate. Use the least API needed by the existing caller.

Correct the scope description before extraction: the current database lane catches a
job panic and continues with the same worker state. The renderer owns restart supervision
and its budget (task 081.17). Those are separate mechanisms; a general restart facility
is not already present in the two proposed source files.

## Better Auth sessions

Keep cookie signing, the session check, and password compatibility independent of
better-auth-rs and of the lane crate. A synchronous function taking `&Connection` lets
the caller choose its execution model. The current collection also includes credentials
and scrypt, so document that scope even if the working name remains `better-auth-session`.

The connection alone does not express session maintenance. `find_session` currently
reports `InvalidQuery` when a read-only lookup needs renewal or deletion; its app wrapper
tries the writer immediately and skips maintenance when busy. Expose a structured
lookup/maintenance outcome and let port-owned code obtain the writer and recheck before
updating. An expired session remains invalid even when cleanup is deferred. Preserve
the nonblocking reader behavior proven in task 081.17.

Hidden policy and representation choices need explicit treatment:

- Login-domain filtering is application policy, including the different refusals on
  application and auth routes (task 081.32).
- The SQL assumes table and column names, millisecond timestamps, and an organization
  session extension. Document the supported schema and plugins; avoid calling this
  universal Better Auth storage or inventing an unproven schema abstraction.
- Expiry, renewal, cookie options, ID generation, and user-agent bounds are configuration
  or port policy. The current user-agent bound deliberately differs from TypeScript
  (task 081.31).
- Use explicit time or an injected clock. The store, session code, and library must
  agree under the test clock. A small milliseconds type suffices for session internals;
  replacing the app's `Timestamp` with chrono's default serialization is not known to
  preserve JavaScript's exact date representation.
- Scrypt's benchmark counters belong to the host. Preserve the tested normalization,
  salt, hash, and error behavior when moving its implementation. If a real consumer
  needs cookies without SQLite or AWS-LC, assess a narrow feature then.

## Better Auth compatibility

The supported auth handlers and their SQLite operations, from 081.28's hand-port: sign-in,
sign-out, OAuth with a module per provider, account listing and unlinking, API keys,
passkeys, organizations, and the error page. Optional features per area, added as ports
prove them; an area no port has proven isn't offered.

Keep the same seams as the sessions crate. Handlers take a connection or a small
port-implemented execution trait, not the lane crate, so a port keeps its own admission.
Writes that span several statements keep one writer from start to finish, and a cancelled
caller leaves no half-written state. Hooks the app runs on user and session creation, such
as login domains and refusing unverified sign-ups, apply on every path that creates them.

Keep HTTP composition in the port at first: the host's request and response types, Axum,
wire errors, the client-address header, and form normalization. Extract a shared
refusal type only where two handlers need it. The compatibility profile stays explicit:
Better Auth's version, the schema columns, the session table without an `active` column,
and the providers and plugins covered.

better-auth-rs is a reference for providers and protocol details, borrowed with
attribution under its MIT or Apache-2.0 license. Its storage traits and transactions are
not part of the design.

## Implementation order

Lane, then sessions, then compatibility, each a change of its own with its own
verification. The first two need nothing from the third. Pin the crates to fetchable
exact revisions; no sibling-checkout dependency may be required by CI or images.

Future TypeScript jobs are a reason to keep execution, storage, and HTTP policy separate.
They are not a reason to build an unproven universal executor now.

## Acceptance criteria

- [x] The maintainer's boundary choices recorded in decisions and reflected in 081.41
      (2026-10-22)
- [ ] Each crate builds and tests independently, with its supported compatibility scope
      and dependency direction documented
- [ ] Session renewal with a busy writer, multi-statement writes under cancellation, shared
      admission deadlines, and permit ownership preserved by meaningful tests
- [ ] App policy, schema assumptions, clocks, wire types, instrumentation, and HTTP
      composition each have an explicit owner
- [ ] The existing conformance, byte comparison, hardening, page, dependency, and
      performance gates in 081.41 pass at the extracted revisions
- [ ] The port's setup, architecture, dependency provenance, and maintenance instructions
      work with the extracted crates without requiring future kit synchronization

## Evidence read for this review

Snowtime: tasks 043 (local database contention), 078 (load model), 079 (rejected page
shells), 080 (teams becoming app rules), 081 (repository split), 084 (API transition),
089 (per-domain layout), 090 (harness corrections), 091 (session cache difference), and
093 (API keys and the cancelled device-sign-in scope).

snowtime-native: the relevant design, result, and verification sections of tasks 081.01–06,
081.10, 081.12, 081.15–17, 081.26–33, 081.37–41, and the auth spike; the actual admission,
lane, session, cookie, password, store, transaction, bridge, and schema code. Historical
task measurements are cited as recorded evidence, not rerun by this documentation review.
