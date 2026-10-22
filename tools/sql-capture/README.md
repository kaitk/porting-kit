# SQL capture

Records every database call an app makes while traffic runs through it, tagged with the
request that made it, and writes each route's SQL to a file: the porting aid for that
route. A port is recorded the same way, and a comparison per route shows whether it does
more database work than the app: more statements, statements repeated within one request
(likely N+1 queries or queries in a loop), fewer transactions, or writes outside one.

```sh
bun <kit>/tools/sql-capture/cli.ts route-parity.json --capture app.jsonl --out sql/
bun <kit>/tools/sql-capture/cli.ts route-parity.json --compare app.jsonl port.jsonl [--json report.json]
```

The first argument is [route-parity](../route-parity/README.md)'s config. Requests are
joined to its route table by method and path, so a route's SQL file and its parity entry
name the same route. A request no route matches, such as a page, is grouped by its URL
with id-like segments as `:id`.

The traffic is whatever exercises the app: a conformance suite, end-to-end tests, or
recorded requests replayed. The tool doesn't need tests of its own kind.

## Capturing

The format is one JSON line per database call and per finished request
([`format.ts`](format.ts)):

| Field | Meaning |
| --- | --- |
| `kind` | `statement`, `batch`, `script`, `begin`, `commit`, `rollback`, or `request`. |
| `request` | The request's id; a call without one ran outside any request. |
| `tx` | The transaction the call ran in, for drivers that report it. |
| `statements` | `{ sql, params }` for each statement the call sent; parameter values are left out. |
| `method`, `url`, `status` | On a `request` line. |
| `parent` | On a `request` line, the request it ran inside in process, such as the page whose loader called the API. |
| `ms` | The call's or the request's duration. |

A driver whose transactions are plain `BEGIN` and `COMMIT` statements, such as SQLite's
trace hook or Postgres, writes them as `statement` lines; the tool recognizes them.

Adapters:

- `@libsql/client`: [`libsql.ts`](libsql.ts). A patch applied only for the capture run
  connects it in two places: `captureClient()` around the client the app opens, and
  `captureRequest()` around each request the app serves. It writes to the file in
  `SQL_CAPTURE` and does nothing without it. It imports nothing else, so a port can copy
  it into the app's source for the run.
- Other drivers: not written yet. For Postgres and MySQL, the plan is to read
  OpenTelemetry spans, whose instrumentations already tag queries with their route; for
  Rust, SQLite's trace hook or `tracing` spans (porting-kit-dev task 004).

## Reading the results

`--out` writes one Markdown file per route and a `README.md` index. Each file gives the
requests captured; per request, the calls, statements, transactions, and writes outside a
transaction; and each distinct statement, with how many requests ran it and the most times
one request did.

A **call** is one trip to the database: a statement, a batch, or a transaction's begin or
commit. For a database over the network, such as Turso or Postgres, calls are round
trips. For an embedded database such as SQLite in the port's process, they cost no
network time, so `--compare` shows calls and statements side by side and notes only
statements, repeats, and transactions.

`--compare` prints one row per route, app → port, with notes where the port does more
work or less protection than the app, where the captures hold different numbers of
requests for a route (so its medians may differ for that reason alone), and where a route
appears in one capture only. Differences the port makes on purpose go in the config's
`sqlCapture.accepted`: groups of `{ "reason", "routes", "statements" }`, the extra
statements per request accepted on the routes named, or on every route with `"*"`. It
reports and doesn't fail: a port may repeat a statement on purpose, and the notes are for
review.

## Test

`test/run.sh` captures a fixture API with an N+1 query and two writes outside a
transaction, then a fixed version standing in for a port, and checks the files and the
comparison in both directions.
