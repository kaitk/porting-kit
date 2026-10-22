---
title: Drizzle on SQLite to rusqlite
layer: database
status: proven # for Snowtime's scope: SQLite in-process, Drizzle's SQL migrations
checked: 2026-10-22
applies: Drizzle ORM with the SQLite or libSQL dialect and its SQL migration folders, the schema kept
versions:
  drizzle-orm: 1.0.0-rc.4 (the Turso dialect)
  rusqlite: 0.40.2 (SQLite 3.53.2 bundled)
  rust: 1.99
evidence:
  - snowtime-native 081.03 (query layers compared), 081.06 (server layout)
  - snowtime-native 081.10 and 081.17 (readers, writer, and bounded admission)
  - snowtime-native 081.33 (migration and transaction audit fixes)
---

# Drizzle on SQLite to rusqlite

The port reads and writes the app's own SQLite file with `rusqlite` and SQL strings, and
applies the app's Drizzle migrations itself, so both backends can run on one database and
either can migrate it.

## When it applies

The app uses Drizzle with SQLite or libSQL, keeps its migrations as Drizzle's SQL
folders (Drizzle 1.0: `<yyyyMMddHHmmss>_<name>/migration.sql`, with no `_journal.json`),
and the port keeps the schema.

It doesn't apply as written when:

- the database is Postgres or MySQL: no port has tried them;
- the port uses Turso's hosted database rather than a local file: planned, not proven;
- the app relies on Drizzle's `push` with no migration files: the port has nothing to
  apply.

## What to expect

Each rule ported with SQL strings took 1.44 times the TypeScript's code lines, against
SeaQuery's 1.64 (081.03). Statements read like the Drizzle queries they replace, and the
same SQL can be compared side by side. SQL strings lose only where a statement is built
from parts, which `Assignments` covers.

One writer and a pool of read-only connections on WAL serve the app; work waits for a
connection bounded by count and time, and is refused with 503 past either bound
(081.17). Rules don't share connections across `await`.

## Choices for the user

1. **The reader pool.** Recommend `auto`: one read-only connection per core, none on a
   one-core host. The gain depends on the workload; 081.10 records the measurements.
2. **Whether the port may migrate.** Recommend letting either backend apply pending
   migrations at start, as Snowtime's self-hosted start does, so a self-hoster can switch
   either way.

## Steps

1. **Connections.** One writer thread that owns the read-write connection, and one thread
   per reader that owns a read-only connection; jobs reach them through bounded channels.
   WAL mode, a 5-second busy timeout, and a prepared-statement cache sized for the app
   (Snowtime: 256 on the writer, 64 per reader).
2. **The migrator.** Apply Drizzle's migrations as drizzle-orm's SQLite migrator does:
   the `__drizzle_migrations` table, each file's SHA-256, the folder name's leading
   `yyyyMMddHHmmss` as `created_at` in UTC, statements split on
   `--> statement-breakpoint`. Refuse a recorded migration whose hash changed.
3. **The SQL helpers.** `sql!` (literals are text, values bind in order), `list` for
   `in (…)`, and `Assignments` for a `SET` of the fields present: absent, null, or a value.
4. **Types at the boundary.** `timestamp_ms` columns as an integer of milliseconds that
   travels as `Date.toJSON`'s ISO string; booleans as integers; JSON columns as text.
5. **Rules one at a time,** each run by the conformance suite and the byte comparison.

## Pitfalls

- **Foreign keys during migrations.** Drizzle's migrations turn `foreign_keys` off inside
  the file, which SQLite ignores in a transaction. Turn it off before the transaction,
  run `foreign_key_check` before commit, and turn it back on after. A table rebuild with
  `CREATE TABLE … AS SELECT` drops its keys; drizzle's libSQL migrator applies it anyway,
  the port refuses it (081.33).
- **Deferred transactions fail at once.** A deferred transaction that reads and then
  writes fails with `SQLITE_BUSY`, without waiting, when another process such as
  Litestream wrote in between. Use immediate transactions for every write (081.30, L14;
  fixed in 081.33).
- **Statement-cache churn.** `prepare_cached` keys on the SQL text, so a `list` whose
  length varies makes a new statement each time and evicts others. Raise the cache, or
  bind the list as one JSON value with `json_each`.
- **Dates must round-trip byte for byte.** Write and parse ISO strings as `Date` does:
  milliseconds always, `Z`, and the forms `new Date(string)` accepts.
- **`'null'` in JSON columns.** Better Auth's adapter writes a missing JSON value as the
  text `'null'`; keep whatever the app's adapter writes.
- **Only literal SQL.** Keep SQL text `&'static str` and bind every value; a fragment
  carries its own parameters.

## Verify

- The conformance suite and the byte comparison of every call.
- The migrator against the app's migration folder on a fresh database and on a copy of a
  database the TypeScript backend migrated; both backends then start on the result.
- A table-rebuild migration with cascading children keeps child rows, and a migration
  that breaks a foreign key rolls back.

## Reference code

snowtime-native at `4dc2f0c`, in `crates/server/src/`:

| File             | Lines | What it does | Generic or policy |
| ---------------- | ----: | ------------ | ----------------- |
| `queries.rs`     |   223 | `sql!`, `Sql`, `Assignments`, `list` | Generic |
| `migrations.rs`  |   328 | Drizzle's migrator, with foreign-key checks and tests | Generic |
| `timestamp.rs`   |   208 | `timestamp_ms` and `Date`'s ISO format | Generic |
| `connections.rs` |   167 | Read-only WAL connections, one per reader thread | Generic |
| `admission.rs`, `lane.rs` | 424 | Bounded admission and the database lanes | Generic; the sizes are the app's |
| `scope.rs`       |    81 | Tenancy: the organization a request may touch | Policy |
