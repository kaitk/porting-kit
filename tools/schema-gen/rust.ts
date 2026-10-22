// Writes Rust from the schema IR: per module, the input structs (serde) and one validator
// per schema node, which follows valibot's run order, so the first issue and the normalized
// value match the app's. What the IR marks as a hook is called by name; the port writes it.
import type { Action, Ir, Message, Node } from './ir'
import { snake } from './introspect'
import { translateRegex } from './regex'

export interface RustOptions {
  // The Rust type of a date, which deserializes from the wire's string.
  dateType: string
  // A function from &str to Option<_> that accepts what the app's transport revives as a
  // date (only with revive.dates).
  dateParse?: string
  // Where module M's hooks live, with {module} for M.
  hooks: string
  // The app's transport turns strings into dates or booleans before validating (a GET's
  // query, for instance), through objects, arrays, wrappers, and variants, not unions.
  revive?: { dates?: boolean; booleans?: boolean }
  // Types the port provides instead of emitted ones: by node id, or by "Struct.field".
  types?: Record<string, string>
  // Names for emitted structs and enums, by node id.
  names?: Record<string, string>
  // Derives besides Deserialize: for every type ("*"), or by name.
  derives?: Record<string, string[]>
  // Lines for each file's header: where it came from and the command that made it.
  header: string[]
}

export interface RustOutput {
  files: Record<string, string>
  hooks: { module: string; name: string; signature: string; source: string }[]
}

const WRAPPERS = new Set(['optional', 'nullable', 'nullish', 'exact_optional'])
const OPTIONAL = new Set(['optional', 'exact_optional', 'nullish'])
const KEYWORDS = new Set(
  'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self static struct super trait true type unsafe use where while abstract become box do final macro override priv typeof unsized virtual yield try gen'.split(
    ' ',
  ),
)

function pascal(text: string) {
  return snake(text)
    .split(/[^a-z\d]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')
}

function camel(snakeName: string) {
  return snakeName.replace(/_([a-z\d])/g, (_, c: string) => c.toUpperCase())
}

function fieldName(key: string) {
  const name = snake(key).replace(/[^a-z\d_]/g, '_')
  return KEYWORDS.has(name) ? `r#${name}` : /^\d/.test(name) ? `_${name}` : name
}

export function rustString(text: string) {
  let out = '"'
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (ch === '"' || ch === '\\') out += `\\${ch}`
    else if (ch === '\n') out += '\\n'
    else if (ch === '\t') out += '\\t'
    else if (ch === '\r') out += '\\r'
    else if (code < 0x20 || code === 0x7f) out += `\\u{${code.toString(16)}}`
    else out += ch
  }
  return `${out}"`
}

export function emitRust(ir: Ir, options: RustOptions): RustOutput {
  const problems: string[] = []
  const node = (id: string): Node => ir.nodes[id]
  const moduleOf = (id: string) => id.split('.')[0]
  const modules = [...new Set(Object.keys(ir.nodes).map(moduleOf))]
  const body = new Map<string, string[]>(modules.map((m) => [m, []]))
  const statics = new Map<string, string[]>(modules.map((m) => [m, []]))
  const types = new Map<string, string[]>(modules.map((m) => [m, []]))
  const hooks = new Map<string, RustOutput['hooks'][number]>()
  const revive = options.revive ?? {}

  // Names of the emitted structs and enums, by node id, from the roots down; the first path
  // to reach a shared node names it.
  const named = new Map<string, string>()
  const taken = new Set<string>()
  function assign(id: string, proposal: string) {
    const n = node(id)
    if (options.types?.[id] || named.has(id)) return
    const name = options.names?.[id] ?? n.export?.name ?? proposal
    if (n.type === 'object' || n.type === 'loose_object' || n.type === 'variant') {
      if (taken.has(name)) problems.push(`${id}: the name ${name} is taken; give it one in names`)
      taken.add(name)
      named.set(id, name)
      if (n.entries) for (const e of n.entries) assign(e.node, name + pascal(e.key))
      for (const option of n.union ?? []) {
        const arm = node(option)
        const literal = arm.entries?.find((e) => e.key === n.key)
        const tag = literal ? String(node(literal.node).literal) : option
        for (const e of arm.entries ?? []) {
          if (e.key !== n.key) assign(e.node, name + pascal(tag) + pascal(e.key))
        }
      }
      return
    }
    if (n.wrapped) assign(n.wrapped, name)
    if (n.item) assign(n.item, name)
  }
  for (const root of ir.inputs) assign(root.node, root.name)

  const memoType = new Map<string, string>()
  function rustType(id: string): string {
    const known = memoType.get(id)
    if (known) return known
    const n = node(id)
    let result: string
    if (options.types?.[id]) result = options.types[id]
    else if (n.pipe?.some((a) => a.type === 'transform')) result = 'Value'
    else if (n.type === 'optional' || n.type === 'exact_optional') result = rustType(n.wrapped!)
    else if (n.type === 'nullable' || n.type === 'nullish') result = `Option<${rustType(n.wrapped!)}>`
    else if (named.has(id)) result = `${named.get(id)}`
    else
      switch (n.type) {
        case 'string':
          result = 'String'
          break
        case 'number':
          result = 'f64'
          break
        case 'boolean':
          result = 'bool'
          break
        case 'date':
          result = options.dateType
          break
        case 'literal':
          result = scalarType([n.literal])
          break
        case 'picklist':
          result = scalarType(n.options!)
          break
        case 'array':
          result = `Vec<${rustType(n.item!)}>`
          break
        case 'union': {
          const all = [...new Set(n.union!.map(rustType))]
          result = all.length === 1 ? all[0] : 'Value'
          break
        }
        default:
          result = 'Value'
      }
    memoType.set(id, result)
    return result
  }
  function scalarType(values: unknown[]) {
    if (values.every((v) => typeof v === 'string')) return 'String'
    if (values.every((v) => typeof v === 'boolean')) return 'bool'
    if (values.every((v) => typeof v === 'number')) return 'f64'
    return 'Value'
  }

  // Whether a subtree holds a date or a boolean, which revival changes.
  const memoRevive = new Map<string, boolean>()
  function revives(id: string): boolean {
    if (!revive.dates && !revive.booleans) return false
    if (memoRevive.has(id)) return memoRevive.get(id)!
    memoRevive.set(id, false)
    const n = node(id)
    const children = [n.wrapped, n.item, ...(n.entries ?? []).map((e) => e.node), ...(n.union ?? [])]
    const result =
      (n.type === 'date' && !!revive.dates) ||
      (n.type === 'boolean' && !!revive.booleans) ||
      children.some((c) => c && revives(c))
    memoRevive.set(id, result)
    return result
  }

  const fnNames = new Map<string, string>()
  const usedFns = new Set<string>()
  let regexCount = 0

  function messageExpr(m: Message | undefined, label: string, expected: string | null, received: string) {
    if (m?.text !== undefined) {
      const key = m.key ? `Some(${rustString(m.key)})` : 'None'
      const params = Object.entries(m.params ?? {}).map(([name, value]) =>
        typeof value === 'number'
          ? `(${rustString(name)}, Param::Number(${value}))`
          : `(${rustString(name)}, Param::Text(${rustString(value)}))`,
      )
      return `Issue::keyed(${key}, &[${params.join(', ')}], ${rustString(m.text)})`
    }
    const expects = expected === null ? 'None' : `Some(${rustString(expected)})`
    return `Issue::default(${rustString(label)}, ${expects}, &${received})`
  }

  function hookPath(module: string) {
    return options.hooks.replaceAll('{module}', module)
  }

  function useHook(action: Action, signature: string) {
    const hook = action.hook!
    const key = `${hook.module}::${hook.name}`
    const known = hooks.get(key)
    if (known && known.signature !== signature) {
      problems.push(`hook ${hook.name}: used as ${known.signature} and as ${signature}`)
    }
    hooks.set(key, { module: hook.module, name: hook.name, signature, source: hook.source })
    return `${hookPath(hook.module)}::${hook.name}`
  }

  // The validator of a node, emitted on first use; its name is returned.
  function fn(id: string, revived: boolean): string {
    const n = node(id)
    if ((n.type === 'optional' || n.type === 'exact_optional') && n.default === undefined && !n.pipe) {
      return fn(n.wrapped!, revived)
    }
    const r = revived && revives(id)
    const key = `${id}|${r}`
    const known = fnNames.get(key)
    if (known) return known
    const module = moduleOf(id)
    let local = `n_${snake(id.slice(module.length + 1)).replace(/[^a-z\d]+/g, '_').replace(/^_|_$/g, '')}${r || !revives(id) ? '' : '_raw'}`
    while (usedFns.has(`${module}::${local}`)) local += '_'
    usedFns.add(`${module}::${local}`)
    const name = `super::${module}::${local}`
    fnNames.set(key, name)
    const code = validator(node(id), r)
    body.get(module)!.push(
      `pub(super) fn ${local}(v: &mut Value, ctx: &mut Ctx) -> bool {\n    let start = ctx.count;\n${code}\n}`,
    )
    return name
  }

  function typeIssue(n: Node, received = 'received(Some(v))') {
    return messageExpr(n.message, 'type', n.expects, received)
  }

  function validator(n: Node, r: boolean): string {
    const lines: string[] = []
    const add = (line: string) => lines.push(`    ${line}`)
    switch (n.type) {
      case 'string':
      case 'number':
        add(`if !v.is_${n.type}() {`)
        add(`    ctx.add(${typeIssue(n)});`)
        add('    return false;')
        add('}')
        add('let mut typed = true;')
        break
      case 'boolean':
        if (r) {
          add('if let Value::String(text) = v {')
          add('    match text.as_str() {')
          add('        "true" => *v = Value::Bool(true),')
          add('        "false" => *v = Value::Bool(false),')
          add('        _ => {}')
          add('    }')
          add('}')
        }
        add('if !v.is_boolean() {')
        add(`    ctx.add(${typeIssue(n)});`)
        add('    return false;')
        add('}')
        add('let mut typed = true;')
        break
      case 'date':
        if (r) {
          if (!options.dateParse) problems.push('revive.dates needs rust.dateParse')
          add('match v {')
          add(`    Value::String(text) if ${options.dateParse}(text).is_some() => {}`)
          add('    Value::String(_) => {')
          add(`        ctx.add(${typeIssue(n, '"\\"Invalid Date\\"".to_owned()')});`)
          add('        return false;')
          add('    }')
          add('    _ => {')
          add(`        ctx.add(${typeIssue(n)});`)
          add('        return false;')
          add('    }')
          add('}')
        } else {
          add(`ctx.add(${typeIssue(n)});`)
          add('return false;')
          return lines.join('\n')
        }
        add('let mut typed = true;')
        break
      case 'literal':
        add(`if !same(v, &serde_json::json!(${JSON.stringify(n.literal)})) {`)
        add(`    ctx.add(${typeIssue(n)});`)
        add('    return false;')
        add('}')
        add('let mut typed = true;')
        break
      case 'picklist': {
        const values = n.options!
        const test = values.every((o) => typeof o === 'string')
          ? `v.as_str().is_some_and(|s| [${values.map((o) => rustString(o as string)).join(', ')}].contains(&s))`
          : `[${values.map((o) => `serde_json::json!(${JSON.stringify(o)})`).join(', ')}].iter().any(|o| same(v, o))`
        add(`if !${test} {`)
        add(`    ctx.add(${typeIssue(n)});`)
        add('    return false;')
        add('}')
        add('let mut typed = true;')
        break
      }
      case 'unknown':
      case 'any':
        add('let mut typed = true;')
        break
      case 'optional':
      case 'exact_optional':
        add(`let mut typed = ${fn(n.wrapped!, r)}(v, ctx);`)
        break
      case 'nullable':
      case 'nullish': {
        const inner = `${fn(n.wrapped!, r)}(v, ctx)`
        if (n.default !== undefined && n.default !== null) {
          add('if v.is_null() {')
          add(`    *v = serde_json::json!(${JSON.stringify(n.default)});`)
          add('}')
          add(`let mut typed = ${inner};`)
        } else {
          add(`let mut typed = v.is_null() || ${inner};`)
        }
        break
      }
      case 'object':
      case 'loose_object': {
        add('let Some(mut input) = take_entries(v) else {')
        add(`    ctx.add(${typeIssue(n)});`)
        add('    return false;')
        add('};')
        add('let mut out = serde_json::Map::new();')
        add('let mut typed = true;')
        for (const entry of n.entries!) {
          const e = node(entry.node)
          const key = rustString(entry.key)
          add(`if let Some(mut value) = input.remove(${key}) {`)
          add(`    typed &= ${fn(entry.node, r)}(&mut value, ctx);`)
          add(`    out.insert(${key}.into(), value);`)
          if (OPTIONAL.has(e.type) && e.default !== undefined) {
            add('} else {')
            add(`    let mut value = serde_json::json!(${JSON.stringify(e.default)});`)
            add(`    typed &= ${fn(entry.node, r)}(&mut value, ctx);`)
            add(`    out.insert(${key}.into(), value);`)
            add('}')
          } else if (!OPTIONAL.has(e.type)) {
            add('} else {')
            add(`    ctx.add(${messageExpr(n.message, 'key', JSON.stringify(entry.key), '"undefined".to_owned()')});`)
            add('    typed = false;')
            add('}')
          } else {
            add('}')
          }
        }
        if (n.type === 'loose_object') add('out.extend(input);')
        add('*v = Value::Object(out);')
        break
      }
      case 'array':
        add('let Value::Array(items) = v else {')
        add(`    ctx.add(${typeIssue(n)});`)
        add('    return false;')
        add('};')
        add('let mut typed = true;')
        add('for item in items.iter_mut() {')
        add(`    typed &= ${fn(n.item!, r)}(item, ctx);`)
        add('}')
        break
      case 'union': {
        add('let mut typed_failures: Vec<(Value, Ctx)> = Vec::new();')
        add('let mut untyped_failures: Vec<(Value, Ctx)> = Vec::new();')
        for (const option of n.union!) {
          add('{')
          add('    let mut value = v.clone();')
          add('    let mut option = Ctx::default();')
          add(`    if ${fn(option, false)}(&mut value, &mut option) {`)
          add('        if option.count == 0 {')
          add('            *v = value;')
          add('            return true;')
          add('        }')
          add('        typed_failures.push((value, option));')
          add('    } else {')
          add('        untyped_failures.push((value, option));')
          add('    }')
          add('}')
        }
        add('let mut typed = true;')
        add('if typed_failures.len() == 1 {')
        add('    let (value, option) = typed_failures.pop().unwrap();')
        add('    *v = value;')
        add('    ctx.merge(option);')
        add('} else if !typed_failures.is_empty() {')
        add(`    ctx.add(${typeIssue(n)});`)
        add('} else if untyped_failures.len() == 1 {')
        add('    let (value, option) = untyped_failures.pop().unwrap();')
        add('    *v = value;')
        add('    ctx.merge(option);')
        add('    return false;')
        add('} else {')
        add(`    ctx.add(${typeIssue(n)});`)
        add('    return false;')
        add('}')
        break
      }
      case 'variant': {
        const key = rustString(n.key!)
        const discriminators = n.union!.map((option) => {
          const entry = node(option).entries?.find((e) => e.key === n.key)
          if (!entry) problems.push(`${n.id}: an option without the key ${n.key}`)
          return node(entry!.node)
        })
        const expects = [...new Set(discriminators.map((d) => d.expects))]
        const expected = expects.length > 1 ? `(${expects.join(' | ')})` : (expects[0] ?? 'never')
        add('if !(v.is_object() || v.is_array()) {')
        add(`    ctx.add(${typeIssue(n)});`)
        add('    return false;')
        add('}')
        add(`let discriminator = entry(v, ${key});`)
        add('let mut output: Option<(Value, Ctx, bool)> = None;')
        n.union!.forEach((option, i) => {
          const d = discriminators[i]
          add('if output.as_ref().is_none_or(|(_, o, _)| o.count > 0) {')
          add('    let valid = match &discriminator {')
          add(`        Some(d) => ${fn(d.id, r)}(&mut d.clone(), &mut Ctx::default()),`)
          add(`        None => ${OPTIONAL.has(d.type)},`)
          add('    };')
          add('    if valid {')
          add('        let mut value = v.clone();')
          add('        let mut option = Ctx::default();')
          add(`        let typed = ${fn(option, r)}(&mut value, &mut option);`)
          add('        if output.as_ref().is_none_or(|(_, _, t)| !t && typed) {')
          add('            output = Some((value, option, typed));')
          add('        }')
          add('    }')
          add('}')
        })
        add('let Some((value, option, mut typed)) = output else {')
        add(
          `    ctx.add(${messageExpr(n.message, 'type', expected, 'received(discriminator.as_ref())')});`,
        )
        add('    return false;')
        add('};')
        add('*v = value;')
        add('ctx.merge(option);')
        break
      }
      default:
        problems.push(`${n.id}: no validator for ${n.type}`)
    }
    for (const action of n.pipe ?? []) lines.push(...pipeStep(n, action).map((l) => `    ${l}`))
    lines.push('    typed')
    return lines.join('\n')
  }

  function hookArgument(n: Node): { signature: string; prelude?: string; arg: string } {
    let base = n
    while (WRAPPERS.has(base.type)) base = node(base.wrapped!)
    switch (base.type) {
      case 'string':
      case 'picklist':
        return { signature: 'fn(&str) -> bool', arg: 'str_of(v)' }
      case 'number':
        return { signature: 'fn(f64) -> bool', arg: 'f64_of(v)' }
      case 'boolean':
        return { signature: 'fn(bool) -> bool', arg: 'v.as_bool().unwrap_or_default()' }
      case 'object':
      case 'loose_object':
      case 'variant': {
        const type = rustType(n.id)
        return {
          signature: `fn(&${type}) -> bool`,
          prelude: `let Some(input) = typed_input::<${type}>(v, ctx) else { return false; };`,
          arg: '&input',
        }
      }
      default:
        return { signature: 'fn(&Value) -> bool', arg: 'v' }
    }
  }

  function pipeStep(n: Node, action: Action): string[] {
    const out: string[] = []
    const transform = (call: string) => {
      out.push('if ctx.count > start {', '    return false;', '}', call)
      return out
    }
    switch (action.type) {
      case 'trim':
      case 'trim_start':
      case 'trim_end':
        return transform(`transform(v, ${action.type});`)
      case 'to_lower_case':
        return transform('transform(v, |s| s.to_lowercase());')
      case 'to_upper_case':
        return transform('transform(v, |s| s.to_uppercase());')
      case 'transform':
        return transform(`${useHook(action, 'fn(&mut Value)')}(v);`)
    }
    let test: string
    let received = 'received(Some(v))'
    let prelude: string | undefined
    switch (action.type) {
      case 'min_length':
        test = `length(v) >= ${action.requirement}`
        received = 'length(v).to_string()'
        break
      case 'max_length':
        test = `length(v) <= ${action.requirement}`
        received = 'length(v).to_string()'
        break
      case 'length':
        test = `length(v) == ${action.requirement}`
        received = 'length(v).to_string()'
        break
      case 'non_empty':
        test = 'length(v) != 0'
        received = '"0".to_owned()'
        break
      case 'regex':
      case 'iso_date':
      case 'email': {
        const translated = translateRegex(action.regex!.source, action.regex!.flags)
        if ('problem' in translated) {
          problems.push(`${n.id}: the regex /${action.regex!.source}/: ${translated.problem}`)
          test = 'false'
          break
        }
        const name = `RE_${++regexCount}`
        statics
          .get(moduleOf(n.id))!
          .push(
            `static ${name}: LazyLock<Regex> = LazyLock::new(|| Regex::new(${rustString(translated.pattern)}).unwrap());`,
          )
        test = `${name}.is_match(str_of(v))`
        break
      }
      case 'integer':
        test = '{ let n = f64_of(v); n.is_finite() && n.fract() == 0.0 }'
        break
      case 'min_value':
        test = `f64_of(v) >= ${action.requirement} as f64`
        break
      case 'max_value':
        test = `f64_of(v) <= ${action.requirement} as f64`
        break
      case 'check':
      case 'partial_check': {
        const argument = hookArgument(n)
        prelude = argument.prelude
        test = `${useHook(action, argument.signature)}(${argument.arg})`
        break
      }
      default:
        problems.push(`${n.id}: no step for ${action.type}`)
        test = 'true'
    }
    out.push('if typed && ctx.count == start {')
    if (prelude) out.push(`    ${prelude}`)
    out.push(`    if !(${test}) {`)
    out.push(`        ctx.add(${messageExpr(action.message, action.label!, action.expects ?? null, received)});`)
    out.push('    }')
    out.push('}')
    return out
  }

  // Struct and enum definitions.
  function derives(name: string) {
    const all = ['Deserialize', ...(options.derives?.['*'] ?? []), ...(options.derives?.[name] ?? [])]
    return `#[derive(${[...new Set(all)].join(', ')})]`
  }
  // A struct's or a variant arm's fields. Absent and null become Option, both Patch; a
  // default makes the value always present. A struct whose keys are all camelCase takes
  // rename_all; otherwise each field that needs it is renamed.
  function fields(entries: { key: string; node: string }[], owner: string, struct: boolean) {
    const renameAll = struct && entries.every((e) => camel(snake(e.key)) === e.key)
    const lines: string[] = []
    for (const entry of entries) {
      const top = node(entry.node)
      const absent = OPTIONAL.has(top.type) && top.default === undefined
      let type = options.types?.[`${owner}.${entry.key}`]
      if (!type) {
        let n = top
        let nul = false
        while (WRAPPERS.has(n.type) && !options.types?.[n.id]) {
          if (n.type === 'nullable' || n.type === 'nullish') {
            nul ||= n.default === undefined || n.default === null
          }
          n = node(n.wrapped!)
        }
        const inner = rustType(n.id)
        type = absent && nul ? `Patch<${inner}>` : absent || nul ? `Option<${inner}>` : inner
      }
      const attrs: string[] = []
      if (absent) attrs.push('default')
      if (!renameAll && fieldName(entry.key).replace(/^r#/, '') !== entry.key) {
        attrs.push(`rename = ${rustString(entry.key)}`)
      }
      if (attrs.length) lines.push(`#[serde(${attrs.join(', ')})]`)
      lines.push(`${struct ? 'pub ' : ''}${fieldName(entry.key)}: ${type},`)
    }
    return { lines, renameAll: renameAll && entries.some((e) => snake(e.key) !== e.key) }
  }
  const indent = (lines: string[], by: string) => lines.map((l) => by + l).join('\n')
  for (const [id, name] of named) {
    const n = node(id)
    const out = types.get(moduleOf(id))!
    if (n.type === 'variant') {
      const arms: string[] = []
      for (const option of n.union!) {
        const arm = node(option)
        const tag = node(arm.entries!.find((e) => e.key === n.key)!.node).literal
        if (typeof tag !== 'string') {
          problems.push(`${id}: a variant whose ${n.key} is not a text literal`)
          continue
        }
        const own = arm.entries!.filter((e) => e.key !== n.key)
        const { lines } = fields(own, name + pascal(tag), false)
        arms.push(`    #[serde(rename = ${rustString(tag)})]\n    ${pascal(tag)} {\n${indent(lines, '        ')}\n    },`)
      }
      out.push(`${derives(name)}\n#[serde(tag = ${rustString(n.key!)})]\npub enum ${name} {\n${arms.join('\n')}\n}`)
      continue
    }
    const { lines, renameAll } = fields(n.entries!, name, true)
    const serde = renameAll ? '#[serde(rename_all = "camelCase")]\n' : ''
    out.push(`${derives(name)}\n${serde}pub struct ${name} {\n${indent(lines, '    ')}\n}`)
  }

  // The roots' Schema impls; validators are emitted as they are reached.
  const impls = new Map<string, string[]>(modules.map((m) => [m, []]))
  const seenRoots = new Set<string>()
  for (const root of ir.inputs) {
    const type = rustType(root.node)
    if (!/^[A-Za-z_][\w:]*$/.test(type) || type === 'Value' || type === 'String') {
      problems.push(`${root.name}: the root's type ${type} is not a struct`)
      continue
    }
    if (seenRoots.has(type)) continue
    seenRoots.add(type)
    impls
      .get(root.module)!
      .push(
        `impl Schema for ${type} {\n    fn check(v: &mut Value, ctx: &mut Ctx) -> bool {\n        ${fn(root.node, true)}(v, ctx)\n    }\n}`,
      )
  }

  if (problems.length) {
    throw new Error(`The Rust emitter cannot write:\n${problems.map((p) => `- ${p}`).join('\n')}`)
  }

  const files: Record<string, string> = {}
  const header = options.header.map((l) => `// ${l}`).join('\n')
  const used = modules.filter(
    (m) => types.get(m)!.length || impls.get(m)!.length || body.get(m)!.length,
  )
  for (const m of used) {
    const moduleHooks = [...hooks.values()].filter((h) => h.module === m)
    const hookLines = moduleHooks.length
      ? [
          '//',
          `// Hooks the port writes in ${hookPath(m)}:`,
          ...moduleHooks.flatMap((h) => [
            `// - ${h.name}: ${h.signature}, after`,
            ...h.source.split('\n').map((l) => `//     ${l}`),
          ]),
        ].join('\n')
      : ''
    const regexes = statics.get(m)!
    const parts = [
      `${header}${hookLines ? `\n${hookLines}` : ''}`,
      [
        'use serde::Deserialize;',
        'use serde_json::Value;',
        regexes.length ? 'use regex::Regex;\nuse std::sync::LazyLock;' : '',
        'use super::runtime::*;',
      ]
        .filter(Boolean)
        .join('\n'),
      ...types.get(m)!,
      ...impls.get(m)!,
      ...body.get(m)!,
      ...regexes,
    ]
    if (regexes.length) {
      parts.push(
        `#[cfg(test)]\n#[test]\nfn regexes_compile() {\n${regexes.map((_, i) => `    LazyLock::force(&${/static (RE_\d+)/.exec(regexes[i])![1]});`).join('\n')}\n}`,
      )
    }
    files[`${m}.rs`] = `${parts.join('\n\n')}\n`
  }
  const roots = [...new Map(ir.inputs.map((r) => [r.name, r])).values()].filter((r) =>
    seenRoots.has(rustType(r.node)),
  )
  const dispatch = roots.map(
    (r) => `        ${rustString(r.name)} => runtime::run::<${r.module}::${rustType(r.node).split('::').pop()}>(value),`,
  )
  files['mod.rs'] = `${header}
#![allow(clippy::all, unused_mut, unused_variables, unused_imports, dead_code)]

${['runtime', ...used].sort().map((m) => `pub mod ${m};`).join('\n')}

/// An input schema's verdict on a value, by the app's export name, for the kit's
/// differential test.
pub fn run(name: &str, value: serde_json::Value) -> Option<serde_json::Value> {
    Some(match name {
${dispatch.join('\n')}
        _ => return None,
    })
}
`
  return { files, hooks: [...hooks.values()] }
}
