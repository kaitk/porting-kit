// bun tools/schema-gen/differential.ts <config.json> [--limit N]
//
// Runs the same inputs through the app's valibot schemas and the port's generated Rust, and
// compares the verdicts: the normalized value, or the first issue's key, parameters, and
// message. The inputs are built from the IR: values each schema accepts, combined into
// valid objects, then each field removed or replaced by every sample value.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { load } from './config'
import type { Node } from './ir'

const [configPath, ...rest] = process.argv.slice(2)
const limit = rest[0] === '--limit' ? Number(rest[1]) : 4000
const { config, app, ir, schemas, probe } = await load(configPath)
if (!config.differential) throw new Error('the config has no differential section')
const revive = config.rust.revive ?? {}

// oxlint-disable-next-line typescript/no-explicit-any -- valibot's schema objects
type Schema = any
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

const SAMPLES: Json[] = [
  null,
  true,
  false,
  0,
  -1,
  1.5,
  7,
  100,
  1e21,
  '',
  ' ',
  'a',
  '  padded  ',
  'x'.repeat(33),
  'x'.repeat(101),
  'x'.repeat(501),
  `${'é'.repeat(250)}😀`,
  'true',
  'false',
  'none',
  'yes',
  '2026-09-24',
  '2026-02-30',
  '2026-9-24',
  '2027-12-31',
  '2026-10-22T10:00:00.000Z',
  '2026-10-22T10:00:00Z',
  '2026-10-23T09:00:00.000Z',
  '2026-10-22T10:00:00+03:00',
  'not a date',
  '0192f3a4-5b6c-7d8e-9f01-23456789abcd',
  '0192F3A4-5B6C-7D8E-BF01-23456789ABCD',
  '0192f3a4-5b6c-4d8e-9f01-23456789abcd',
  'ABC-123',
  'abc-123',
  '#4E79A7',
  'Europe/Tallinn',
  'UTC',
  '+02:00',
  'a@b.co',
  ' A@B.CO ',
  'https://acme.atlassian.net/browse/{key}',
  'http://acme.atlassian.net/browse/{key}',
  [],
  [1],
  {},
]

const node = (id: string): Node => ir.nodes[id]
const pool: Json[] = [...SAMPLES, ...((config.differential.samples ?? []) as Json[])]
for (const n of Object.values(ir.nodes)) {
  for (const value of [n.literal, ...(n.options ?? []), n.default]) {
    if (value !== undefined) pool.push(value as Json)
  }
}
const excluded = new Map<string, string>()
for (const group of config.differential.exclude ?? []) {
  for (const value of group.values) excluded.set(JSON.stringify(value), group.reason)
}
const uniquePool = [...new Map(pool.map((v) => [JSON.stringify(v), v])).values()].filter(
  (v) => !excluded.has(JSON.stringify(v)),
)
for (const reason of new Set(excluded.values())) console.log(`excluded: ${reason}`)

// The transport's revival, as rust.revive describes it, for checking parts of an input.
function reviveFor(schema: Schema, value: unknown): unknown {
  if (value === null || value === undefined) return value
  switch (schema.type) {
    case 'date':
      return revive.dates && typeof value === 'string' ? new Date(value) : value
    case 'boolean':
      if (revive.booleans && value === 'true') return true
      if (revive.booleans && value === 'false') return false
      return value
    case 'optional':
    case 'nullable':
    case 'nullish':
    case 'exact_optional':
      return reviveFor(schema.wrapped, value)
    case 'array':
      return Array.isArray(value) ? value.map((item) => reviveFor(schema.item, item)) : value
    case 'object':
    case 'loose_object': {
      if (typeof value !== 'object' || Array.isArray(value)) return value
      const out: Record<string, unknown> = { ...(value as Record<string, unknown>) }
      for (const [key, entry] of Object.entries(schema.entries)) {
        if (key in out) out[key] = reviveFor(entry, out[key])
      }
      return out
    }
    case 'variant': {
      if (typeof value !== 'object' || Array.isArray(value)) return value
      const record = value as Record<string, unknown>
      const option = schema.options.find((o: Schema) => o.entries[schema.key].literal === record[schema.key])
      return option ? reviveFor(option, value) : value
    }
    default:
      return value
  }
}

function accepts(id: string, value: Json) {
  const schema = schemas.get(id)
  return !schema['~standard'].validate(reviveFor(schema, structuredClone(value))).issues
}

// Values each node accepts, from the sample pool up.
const validMemo = new Map<string, Json[]>()
function valid(id: string): Json[] {
  const known = validMemo.get(id)
  if (known) return known
  validMemo.set(id, [])
  const n = node(id)
  let candidates: Json[]
  if (n.type === 'object' || n.type === 'loose_object') candidates = objects(n)
  else if (n.type === 'array') candidates = [[], ...valid(n.item!).slice(0, 2).map((v) => [v])]
  else if (n.type === 'variant' || n.type === 'union') candidates = n.union!.flatMap((o) => valid(o)).concat(uniquePool)
  else if (n.wrapped) candidates = [null, ...valid(n.wrapped)]
  else candidates = uniquePool
  const result = candidates.filter((v) => accepts(id, v)).slice(0, 8)
  validMemo.set(id, result)
  return result
}

// Objects the schema accepts: the first value of each field, then others, until some pass
// the checks across fields.
function objects(n: Node): Json[] {
  const choices = n.entries!.map((e) => {
    const options: (Json | undefined)[] = valid(e.node).slice(0, 4)
    if (['optional', 'exact_optional', 'nullish'].includes(node(e.node).type)) options.push(undefined)
    return { key: e.key, options: options.length ? options : [null] }
  })
  const found: Json[] = []
  for (let attempt = 0; attempt < 400 && found.length < 4; attempt++) {
    const value: Record<string, Json> = {}
    let index = attempt
    for (const { key, options } of choices) {
      const pick = options[index % options.length]
      index = Math.floor(index / options.length)
      if (pick !== undefined) value[key] = pick
    }
    if (accepts(n.id, value) && !found.some((f) => JSON.stringify(f) === JSON.stringify(value))) found.push(value)
  }
  return found.length ? found : [Object.fromEntries(choices.map((c) => [c.key, c.options[0] ?? null]))]
}

// Inputs for a root: its valid values, each field of them (two levels deep) removed and
// replaced by every sample, and the samples themselves.
function cases(id: string): Json[] {
  const out: Json[] = [...valid(id), ...uniquePool]
  const mutate = (value: Json, entries: { key: string; node: string }[], depth: number, set: (v: Json) => Json) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return
    for (const entry of entries) {
      const without = { ...value }
      delete without[entry.key]
      out.push(set(without))
      for (const sample of uniquePool) out.push(set({ ...value, [entry.key]: sample }))
      out.push(set({ ...value, extra: 'x' }))
      let inner = node(entry.node)
      while (inner.wrapped) inner = node(inner.wrapped)
      if (depth < 2 && inner.entries && value[entry.key] && typeof value[entry.key] === 'object') {
        mutate(value[entry.key], inner.entries, depth + 1, (v) => set({ ...value, [entry.key]: v }))
      }
    }
  }
  let root = node(id)
  while (root.wrapped) root = node(root.wrapped)
  for (const value of valid(id).slice(0, 2)) mutate(value, root.entries ?? [], 1, (v) => v)
  return [...new Map(out.map((v) => [JSON.stringify(v), v])).values()].slice(0, limit)
}

// Dates come back as the strings they were revived from, as the Rust keeps them.
function restoreDates(output: unknown, input: unknown): unknown {
  if (output instanceof Date) return input
  if (Array.isArray(output)) return output.map((item, i) => restoreDates(item, (input as unknown[])?.[i]))
  if (output && typeof output === 'object') {
    return Object.fromEntries(
      Object.entries(output).map(([k, v]) => [k, restoreDates(v, (input as Record<string, unknown>)?.[k])]),
    )
  }
  return output
}

let decode: ((schema: Schema, value: unknown) => unknown) | undefined
if (config.differential.decode) {
  const [file, name] = config.differential.decode.split('#')
  decode = (await import(join(app, file)))[name]
}

// oxlint-disable-next-line typescript/no-explicit-any -- a valibot issue
function verdict(issue: any) {
  const recorded = probe?.(issue)
  return { ok: false, issue: { key: recorded?.key ?? null, params: recorded?.params ?? {}, message: issue.message } }
}

function app_(schema: Schema, value: Json) {
  if (decode) {
    try {
      return { ok: true, value: restoreDates(decode(schema, structuredClone(value)), value) }
    } catch (error) {
      // oxlint-disable-next-line typescript/no-explicit-any -- ValiError
      const issues = (error as any)?.issues
      if (!issues) throw error
      return verdict(issues[0])
    }
  }
  const result = schema['~standard'].validate(reviveFor(schema, structuredClone(value)))
  if (result.issues) return verdict(result.issues[0])
  return { ok: true, value: restoreDates(result.value, value) }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    )
  }
  return value
}

const lines: string[] = []
const expected: { name: string; input: Json; app: unknown }[] = []
for (const root of ir.inputs) {
  const schema = schemas.get(root.node)
  for (const input of cases(root.node)) {
    lines.push(JSON.stringify([root.name, input]))
    expected.push({ name: root.name, input, app: app_(schema, input) })
  }
}

const run = spawnSync('sh', ['-c', config.differential.runner], {
  input: `${lines.join('\n')}\n`,
  encoding: 'utf8',
  maxBuffer: 1 << 30,
  stdio: ['pipe', 'pipe', 'inherit'],
})
if (run.status !== 0) throw new Error(`the runner failed with status ${run.status}`)
const answers = run.stdout.trim().split('\n')
if (answers.length !== expected.length) {
  throw new Error(`the runner answered ${answers.length} lines for ${expected.length} inputs`)
}

const mismatches: Record<string, { input: Json; app: unknown; rust: unknown }[]> = {}
const counts: Record<string, number> = {}
expected.forEach((e, i) => {
  counts[e.name] = (counts[e.name] ?? 0) + 1
  const rust = JSON.parse(answers[i])
  if (JSON.stringify(canonical(rust)) !== JSON.stringify(canonical(e.app))) {
    ;(mismatches[e.name] ??= []).push({ input: e.input, app: e.app, rust })
  }
})

let failed = 0
for (const [name, count] of Object.entries(counts)) {
  const wrong = mismatches[name] ?? []
  failed += wrong.length
  console.log(`${wrong.length ? 'FAIL' : 'ok  '} ${name}: ${count - wrong.length}/${count}`)
  for (const m of wrong.slice(0, 3)) {
    console.log(`     input ${JSON.stringify(m.input)}\n     app   ${JSON.stringify(m.app)}\n     rust  ${JSON.stringify(m.rust)}`)
  }
}
console.log(`${expected.length - failed}/${expected.length} verdicts match`)
process.exit(failed ? 1 : 0)
