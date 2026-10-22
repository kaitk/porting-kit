# 003: Generate a port's input validation from valibot schemas

Status: in-progress (2026-10-22)

A port answers invalid input the way the app does: the same first issue, with its key,
parameters, and message. Writing that by hand is mechanical and easy to get subtly wrong,
and it grows with the app's routes, so the kit generates it. `tools/schema-gen` reads the
app's valibot schemas at run time into an intermediate representation (IR) as JSON,
writes Rust structs and validators that follow valibot's run order, and leaves what it
can't translate to named hooks the port writes. A differential test compares the app and the port on inputs built from the
schemas, so a port without a conformance suite can still trust the result.

snowtime-native task 081.45 proves it: the generated code replaces that port's
hand-written tables.

## Design

- Generic over apps, not over the first port's code: the generated validator is the
  validation, rather than a reproduction of snowtime-native's own field vocabulary, which
  no other port would share. The port supplies its types where its rules need them
  (`rust.types`), its date parser, and its error mapping.
- Two stages: the IR is valibot's structure as JSON, so another emitter or another schema
  library can share half the work.
- What can't be translated is refused, all at once, or becomes a hook with the app's source
  beside it. Regexes are translated with their known limits; lookaround is refused.
- One output file per schema module, so a module is a unit of work, for a person or an
  agent.

## Acceptance criteria

- [x] Snowtime's 28 input schemas, at snowtime `40d9d35`, generate: 149 nodes, 16 hooks.
- [x] snowtime-native builds on the generated code, passes its tests, and its
      differential test matches all 16,375 verdicts, with one recorded exclusion
      (snowtime-native task 081.45).
- [x] A fixture unrelated to Snowtime (`tools/schema-gen/test`, run with `run.sh`)
      matches all 570 verdicts: variants, unions, transforms, loose objects, and number
      bounds.
- [x] snowtime-native's bar passes on the generated code (task 081.45).
- [ ] A port's CI can check the generated files at a kit revision without a sibling
      checkout.
- [ ] Dates revive as the app's engine does: a Rust port of V8's `Date.parse` (BSD) in the
      runtime, the default for apps on Node, checked by the differential test against Node.
      Strict ISO 8601 stays an option, recorded as a deliberate difference. JS backends
      commonly revive with `new Date(text)` (Zod's `z.coerce.date()`, JSON revivers), whose
      lenient forms the spec leaves to each engine.
- [ ] The differential test runs the app on its production runtime (Node by default), not
      on whatever runs the generator.
- [ ] The survey flags lax input coercion (dates, `Number("")`) as a requirements question.
- [ ] The validation recipe (`recipes/server/valibot.md`) points at the tool, once 081.45
      is merged.
