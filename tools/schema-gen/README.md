# Schema generator

Generates a Rust port's input structs and validators from the app's valibot schemas, so
input that fails answers the same first issue the app would: its message, and the key and
parameters the app's messages carry. It imports the app's schema modules and reads the
schemas at run time, since valibot schemas are plain objects that keep their entries,
wrappers, and pipes. It describes them as JSON first, an intermediate representation (IR)
in `ir.ts`, then writes Rust from that.

```sh
bun <kit>/tools/schema-gen/cli.ts schema-gen.json          # write the Rust
bun <kit>/tools/schema-gen/cli.ts schema-gen.json --check  # fail if it is out of date
bun <kit>/tools/schema-gen/differential.ts schema-gen.json # compare with the app
```

Run it from the port, with the app built far enough that its schema modules import: an app
whose messages come from a compiler such as Paraglide needs its generated messages.

## What it writes

Into `rust.out`, one file per schema module, plus `runtime.rs` and `mod.rs`:

- a serde struct for each input schema and each object inside one, and a tagged enum for a
  variant. A field that may be absent is `Option`, one that may be null too is `Patch`
  (absent, null, or a value), and a default makes the value always present;
- one validator per schema node, following valibot's run order: the object's entries in
  order, each pipe step, union and variant selection, defaults, and trimming. It validates
  and normalizes the JSON value, and the struct deserializes from the result;
- `impl Schema` for each input, and `run(name, value)` for the differential test.

The port calls `runtime::parse::<T>(value)` and maps the `Issue` to its own error.

With `rust.revive.dates`, it also writes `js_date.rs`: V8 13.6's `Date.parse` (Node 24),
ported under V8's BSD license, with the legacy forms V8 accepts beyond ISO 8601, such as
`2026-9-24`, `10/22/2026`, `Oct 22 2026 10:00 GMT+2`, or `-1`. A JavaScript backend
commonly revives dates with `new Date(text)` (a JSON reviver, Zod's `z.coerce.date()`),
whose lenient forms the specification leaves to each engine. For an app on Node,
`rust.dateParse` calls `js_date::date_parse(text, to_utc)`, where `to_utc` reads a local
time in the process's time zone, as the app's process does; `js_date::utc` is that for a
process in UTC. Bun accepted the same forms in a spot check (2026-10-22); Deno and
browsers are not checked. Refusing the legacy forms instead is a deliberate difference the
port records in `differential.exclude`.

What it cannot translate it calls by name, as a hook the port writes in `rust.hooks`:
`v.check` and `v.partialCheck` functions, and `v.transform`. Each module's header lists
its hooks with the app's source. A hook on a string takes `&str`, on an object the
generated struct, and a transform `&mut Value`. Everything else it refuses with a list of
what it found, rather than guessing: an async schema, a schema inside a pipe, a nested
variant, a regex with lookaround or backreferences, a message that depends on the input.

## Config

`schema-gen.json`, paths relative to it:

| Field | Meaning |
| --- | --- |
| `app` | The app's checkout. |
| `modules` | Globs of the schema modules, in the app. A module's name is its file name up to the first dot. |
| `inputs` | A regex for the exports to emit, such as `Input$`. |
| `probe` | Optional, `file#export`: a function that, given an issue its message function has seen, answers `{ key, params }`. |
| `ir` | Optional: where to write the IR as JSON, for reading. |
| `rust.out` | The output directory, a Rust module. |
| `rust.dateType`, `rust.dateParse` | The port's date type and its parser from `&str` to `Option`. |
| `rust.hooks` | The module path of hooks, with `{module}`. |
| `rust.revive` | `dates`, `booleans`: the app's transport turns strings into dates or booleans before validating, through objects, arrays, wrappers, and variants, not unions. |
| `rust.types` | Types the port provides: by node id (as in the IR) or by `Struct.field`. Nothing is emitted for them; the validator still is. |
| `rust.names` | Names for emitted structs and enums, by node id. |
| `rust.derives` | Derives besides `Deserialize`, for `*` or by name. |
| `differential.runner` | A command reading `[name, value]` lines and answering `run`'s verdict per line. |
| `differential.decode` | Optional `file#export`: the app's own decoder, called as `decode(schema, value)`. |
| `differential.runtime` | `node` (the default) or `bun`: the runtime the app's verdicts come from, its production runtime. |
| `differential.samples` | Values to try besides the built-in ones. |
| `differential.exclude` | Sample values left out, each group with its reason: a decided difference. |

## The differential test

It builds inputs from the IR: values each schema accepts, from a pool of samples and the
schemas' own literals and defaults, combined into objects that pass the checks across
fields; then each field removed, replaced by every sample, and an extra key added. It runs
each through the app's schema (or its decoder) and the runner, and compares the first
issue's key, parameters, and message, or the normalized value. The app's verdicts come
from the app's production runtime, `differential.runtime`: `node` by default, from a
bundle of the app's schema modules, probe, and decoder built with `bun build
--target=node`, or `bun`, in the generator's own process. Building the inputs runs in
Bun either way; it only picks which values to try.

Dates are compared as the strings they were revived from, so it checks which dates a
schema accepts, not the time each one means. `test/date.mjs` checks the time: it compares
`js_date.rs` with Node's `Date.parse` on 40,069 strings (the forms V8 knows, strings built
from date-like pieces, and date-shaped strings, 5,683 of which parse), in UTC and in a
fixed-offset zone.

## Known limits

- Without the `u` flag JavaScript regexes match UTF-16 units: `.` takes half of an astral
  character where Rust takes all of it. `/i` folds case by Unicode's simple folding in Rust.
- `transform` hooks make the field's type `Value` unless `rust.types` names it.
- Messages are evaluated once, at generation, in the generator's locale: fixed per key and
  parameters, as an API that answers keys has them.
- Issue paths are not kept: the first issue's message, key, and parameters are.
