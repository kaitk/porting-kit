// Reads an app's valibot schemas at run time and describes them as plain JSON (the IR in
// ir.ts). Valibot schemas are plain objects that keep their kind, type, wrapped schemas,
// entries, and pipe, so nothing here imports valibot. Anything the IR cannot describe is
// collected and reported together, never guessed.
import { relative } from 'node:path'
import type { Action, Ir, Message, Node, Owner } from './ir'

type Probe = (issue: Record<string, unknown>) => { key: string; params?: Record<string, unknown> } | undefined
// oxlint-disable-next-line typescript/no-explicit-any -- valibot's objects, read structurally
type Schema = any

export interface IntrospectOptions {
  app: string
  modules: string[]
  inputs: (name: string) => boolean
  probe?: Probe
  // Called with each node's schema object, for tools that run the app's schemas.
  onNode?: (id: string, schema: Schema) => void
}

const WRAPPERS = new Set(['optional', 'nullable', 'nullish', 'exact_optional'])
const SCHEMAS = new Set([
  'string',
  'number',
  'boolean',
  'date',
  'literal',
  'picklist',
  'object',
  'loose_object',
  'array',
  'union',
  'variant',
  'unknown',
  'any',
  ...WRAPPERS,
])
const TRANSFORMS = new Set(['trim', 'trim_start', 'trim_end', 'to_lower_case', 'to_upper_case'])
const VALIDATIONS = new Set([
  'min_length',
  'max_length',
  'length',
  'non_empty',
  'regex',
  'iso_date',
  'email',
  'integer',
  'min_value',
  'max_value',
  'check',
  'partial_check',
])
// The label valibot's default message starts with ("Invalid length: …"), per action.
const LABELS: Record<string, string> = {
  min_length: 'length',
  max_length: 'length',
  length: 'length',
  non_empty: 'length',
  regex: 'format',
  iso_date: 'date',
  email: 'email',
  integer: 'integer',
  min_value: 'value',
  max_value: 'value',
  check: 'input',
  partial_check: 'input',
}

// Valibot's _stringify, for the synthetic issues messages are evaluated with.
function stringify(input: unknown): string {
  const type = typeof input
  if (type === 'string') return `"${input}"`
  if (type === 'number' || type === 'bigint' || type === 'boolean') return `${input}`
  if (type === 'object' || type === 'function')
    return (input && Object.getPrototypeOf(input)?.constructor?.name) ?? 'null'
  return type
}

export async function introspect(options: IntrospectOptions): Promise<Ir> {
  const problems: string[] = []
  const ids = new Map<Schema, string>()
  const nodes: Record<string, Node> = {}
  const exported = new Map<Schema, Owner>()
  const roots: Ir['inputs'] = []
  const hookFns = new Map<unknown, string>()

  const loaded: { module: string; file: string; exports: Record<string, Schema> }[] = []
  for (const file of options.modules) {
    const exports = await import(file)
    const stem = file.split('/').pop()!.split('.')[0]
    loaded.push({ module: stem, file: relative(options.app, file), exports })
    for (const [name, value] of Object.entries(exports)) {
      if (isSchema(value) && !exported.has(value)) exported.set(value, { module: stem, name })
    }
  }

  function isSchema(value: unknown): value is Schema {
    return typeof value === 'object' && value !== null && (value as Schema).kind === 'schema'
  }

  function message(context: Schema, at: string, label: string, sample: [unknown, unknown]): Message {
    const given = context.message
    if (given === undefined) return { default: label }
    if (typeof given === 'string') return { text: given }
    if (typeof given !== 'function') {
      problems.push(`${at}: a message of type ${typeof given}`)
      return { text: '' }
    }
    const evaluate = (input: unknown) => {
      const issue: Record<string, unknown> = {
        kind: context.kind,
        type: context.type,
        input,
        expected: context.expects ?? null,
        received: stringify(input),
        requirement: context.requirement,
        message: '',
      }
      const text = given(issue)
      return { text, probed: options.probe?.(issue) }
    }
    const [a, b] = sample.map(evaluate)
    if (a.text !== b.text || JSON.stringify(a.probed) !== JSON.stringify(b.probed)) {
      problems.push(`${at}: the message depends on the input, which the IR cannot hold`)
    }
    const result: Message = { text: String(a.text) }
    if (a.probed) {
      result.key = a.probed.key
      if (a.probed.params) {
        for (const [name, value] of Object.entries(a.probed.params)) {
          if (typeof value === 'number' ? !Number.isInteger(value) : typeof value !== 'string') {
            problems.push(`${at}: parameter ${name} is ${stringify(value)}, not an integer or text`)
          }
        }
        result.params = a.probed.params as Record<string, string | number>
      }
    }
    return result
  }

  // A JSON default, called if it is a function; one that differs between calls is not a
  // default the IR can hold.
  function defaultOf(schema: Schema, at: string): unknown {
    if (schema.default === undefined) return undefined
    const once = () =>
      JSON.stringify(typeof schema.default === 'function' ? schema.default() : schema.default)
    const first = once()
    if (first !== once() || first === undefined) {
      problems.push(`${at}: a default that is not a constant JSON value`)
      return undefined
    }
    return JSON.parse(first)
  }

  // Hooks are named after their message key, prefixed with their owner where two checks
  // share a key; the names are settled once every hook is known.
  const hooks = new Map<unknown, { owner: Owner; base: string; hook: NonNullable<Action['hook']> }>()
  function hook(owner: Owner, fn: unknown, base: string): NonNullable<Action['hook']> {
    const known = hooks.get(fn)
    if (known) return known.hook
    const made = { name: base, module: owner.module, source: String(fn) }
    hooks.set(fn, { owner, base, hook: made })
    return made
  }
  function nameHooks() {
    const count = new Map<string, number>()
    for (const { base } of hooks.values()) count.set(base, (count.get(base) ?? 0) + 1)
    const taken = new Set<string>()
    for (const { owner, base, hook } of hooks.values()) {
      // A check without a key is named by its owner alone.
      const keyless = base === 'check' || base === 'transform'
      let name = count.get(base) === 1 && !keyless ? base : `${snake(owner.name)}_${base}`
      for (let n = 2; taken.has(name); n++) name = `${snake(owner.name)}_${base}_${n}`
      taken.add(name)
      hook.name = name
    }
  }

  function action(item: Schema, at: string, owner: Owner): Action | undefined {
    const type: string = item.type
    if (TRANSFORMS.has(type)) return { type }
    if (type === 'transform') {
      return {
        type,
        hook: hook(owner, item.operation, 'transform'),
      }
    }
    if (!VALIDATIONS.has(type)) {
      problems.push(`${at}: the ${item.kind} ${type} has no Rust form; port it by hand`)
      return undefined
    }
    const sample: [unknown, unknown] =
      type === 'min_value' || type === 'max_value' || type === 'integer' ? [1.5, 7] : ['a', 'bb']
    const result: Action = {
      type,
      label: LABELS[type],
      expects: item.expects ?? null,
      message: message(item, at, LABELS[type], sample),
    }
    const requirement = item.requirement
    if (requirement instanceof RegExp) {
      result.regex = { source: requirement.source, flags: requirement.flags }
    } else if (typeof requirement === 'number') {
      result.requirement = requirement
    } else if (type === 'check' || type === 'partial_check') {
      const key = result.message?.key
      result.hook = hook(owner, requirement, key ? key.replace(/^validation_/, '') : 'check')
    } else if (type !== 'integer' && type !== 'non_empty') {
      problems.push(`${at}: ${type} with a requirement of type ${typeof requirement}`)
    }
    return result
  }

  function visit(schema: Schema, path: string, owner: Owner): string {
    const known = ids.get(schema)
    if (known) return known
    const name = exported.get(schema)
    // Paths start at the nearest export, so a node's id doesn't depend on who reached it first.
    const at = name ? name.name : path
    const ownerHere = name ?? owner
    let id = `${ownerHere.module}.${at}`
    for (let n = 2; nodes[id]; n++) id = `${ownerHere.module}.${at}~${n}`
    ids.set(schema, id)
    options.onNode?.(id, schema)
    const type: string = schema.type
    const node: Node = { id, type, expects: schema.expects }
    nodes[id] = node
    if (name) node.export = name
    if (!SCHEMAS.has(type)) {
      problems.push(`${at}: the schema ${type} has no Rust form; port it by hand`)
      return id
    }
    if (schema.async) problems.push(`${at}: an async schema`)
    node.message = message(schema, at, 'type', [42, 'x'])
    switch (type) {
      case 'optional':
      case 'nullable':
      case 'nullish':
      case 'exact_optional': {
        node.wrapped = visit(schema.wrapped, `${at}?`, ownerHere)
        const value = defaultOf(schema, at)
        if (value !== undefined) node.default = value
        break
      }
      case 'literal':
        node.literal = schema.literal
        break
      case 'picklist':
        node.options = schema.options
        break
      case 'object':
      case 'loose_object':
        node.entries = Object.entries(schema.entries).map(([key, entry]) => ({
          key,
          node: visit(entry, `${at}.${key}`, ownerHere),
        }))
        break
      case 'array':
        node.item = visit(schema.item, `${at}[]`, ownerHere)
        break
      case 'union':
        node.union = schema.options.map((o: Schema, i: number) => visit(o, `${at}|${i}`, ownerHere))
        break
      case 'variant':
        node.key = schema.key
        node.union = schema.options.map((o: Schema, i: number) => {
          if (o.type === 'variant') problems.push(`${at}: a variant nested in a variant`)
          return visit(o, `${at}|${i}`, ownerHere)
        })
        break
    }
    if (schema.pipe) {
      const actions: Action[] = []
      schema.pipe.slice(1).forEach((item: Schema) => {
        if (item.kind === 'metadata') return
        if (item.kind === 'schema') {
          problems.push(`${at}: a schema inside a pipe`)
          return
        }
        const result = action(item, `${at}>${item.type}`, ownerHere)
        if (result) actions.push(result)
      })
      if (actions.length) node.pipe = actions
    }
    return id
  }

  for (const { module, file, exports } of loaded) {
    for (const [name, value] of Object.entries(exports)) {
      if (!isSchema(value) || !options.inputs(name)) continue
      if (exported.get(value)?.name !== name) continue
      const id = visit(value, name, { module, name })
      roots.push({ module, file, name, node: id })
    }
  }

  nameHooks()
  if (problems.length) {
    throw new Error(`The schemas use what the generator cannot describe:\n${problems.map((p) => `- ${p}`).join('\n')}`)
  }
  return { version: 1, inputs: roots, nodes }
}

export function snake(name: string) {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}
