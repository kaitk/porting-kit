# 002: Review the first crate boundaries against port ownership

Status: todo (review recorded 2026-10-22; boundaries await the maintainer's decision)

Review the three-crate proposal in snowtime-native task 081.41 against the kit's goal:
initialize a well-founded port that can maintain and change its own design. The
recommendations below are proposals, not approved API designs or completed extraction.
Implementation remains in snowtime-native task 081.41 with that port as the first consumer.

## Recommendation

Keep three crates in one workspace. Admission/execution, Better Auth compatibility, and
the better-auth-rs storage adapter have different consumers and dependency lifecycles.
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

## Better Auth compatibility

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

## better-auth-rs on SQLite

Extract storage execution and the transaction mechanism behind the smallest proven
interface. Put the adapter's database-execution trait in the adapter crate, and have the
port implement it on its own wrapper. Having the Tokio-only lane crate implement an
auth-owned trait would pull the dependency in the wrong direction. Do not introduce a
fourth interfaces crate merely to avoid a small port-owned wrapper.

The interface must preserve connection ownership, serialized writes, bounded admission,
and transaction cleanup on cancellation. A transaction holds the same writer throughout
its async callback. Its lifetime deadline is separate from admission; a running SQLite
statement is not interrupted merely because the callback deadline passes. Hooks must
apply inside transaction calls as well as ordinary writes (the auth spike and 081.39).

`Schema` and `LaneSession` in `library/mod.rs` are additional couplings: the latter makes
an existing row active because Snowtime has no `active` column. Column conversion and
unsupported-plugin implementations also encode a specific compatibility profile. Keep
that profile explicit. Refusing an unmounted plugin is useful; it does not constitute
support for that plugin in another port.

Keep most of `bridge.rs` as port-owned integration initially. Besides the client-IP
header name, it knows the host's request and response, Axum, wire errors, a concrete auth
schema, auth paths, callback-body rewriting, and earlier form normalization. Extract a
reusable error/refusal mechanism only where the adapter needs it; HTTP composition is a
reasonable template responsibility.

Check refusal propagation through transactions as well as ordinary calls. The current
bridge tracks refusal in task-local state, while the transaction worker is spawned.
That path needs an explicit test before the extracted API promises 503 preservation.

## Upstream check and implementation order

Task 081.41 reports a large upstream rewrite at better-auth-rs v1.0.0-alpha.5. This review
does not establish the trait diff, the quoted commit count, or compatibility with that
release. Recheck upstream's traits, supported flows, and the fork patches before freezing
the adapter API. Record what is actually verified.

Recommended order: lane, session compatibility, then the library adapter after that
check. Treat an upstream upgrade and a mechanical extraction as distinct changes with
their own verification. The first two crates need not wait for the alpha-library work.
Pin dependencies to fetchable exact revisions as already agreed; no sibling-checkout
dependency may be required by CI or images.

Future TypeScript jobs are a reason to keep execution, storage, and HTTP policy separate.
They are not a reason to build an unproven universal executor now. The first job still
needs its own runtime, capability, cancellation, and database-access proof.

## Acceptance criteria

- [ ] The maintainer's boundary choices recorded in decisions and reflected in 081.41
- [ ] Each crate builds and tests independently, with its supported compatibility scope
      and dependency direction documented
- [ ] Session renewal with a busy writer, transaction cancellation and refusal, shared
      admission deadlines, and permit ownership preserved by meaningful tests
- [ ] App policy, schema assumptions, clocks, wire types, instrumentation, and HTTP
      composition each have an explicit owner
- [ ] Upstream compatibility checked before the adapter API is finalized; no upgrade is
      presented as already verified by the old pin's tests
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
