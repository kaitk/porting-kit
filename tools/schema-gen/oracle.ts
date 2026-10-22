// The app's side of the differential test: its verdict on an input, from its own schema or
// decoder. It imports nothing but its arguments, so the test can bundle it with the app's
// modules and run it on the app's production runtime (differential.runtime).

// oxlint-disable-next-line typescript/no-explicit-any -- valibot's schema objects
type Schema = any

export interface Revive {
  dates?: boolean
  booleans?: boolean
}

// The transport's revival, as rust.revive describes it, for checking parts of an input.
export function reviveFor(revive: Revive, schema: Schema, value: unknown): unknown {
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
      return reviveFor(revive, schema.wrapped, value)
    case 'array':
      return Array.isArray(value) ? value.map((item) => reviveFor(revive, schema.item, item)) : value
    case 'object':
    case 'loose_object': {
      if (typeof value !== 'object' || Array.isArray(value)) return value
      const out: Record<string, unknown> = { ...(value as Record<string, unknown>) }
      for (const [key, entry] of Object.entries(schema.entries)) {
        if (key in out) out[key] = reviveFor(revive, entry, out[key])
      }
      return out
    }
    case 'variant': {
      if (typeof value !== 'object' || Array.isArray(value)) return value
      const record = value as Record<string, unknown>
      const option = schema.options.find((o: Schema) => o.entries[schema.key].literal === record[schema.key])
      return option ? reviveFor(revive, option, value) : value
    }
    default:
      return value
  }
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

export interface Options {
  revive: Revive
  // The app's decoder, called as decode(schema, value); without it, revive and validate.
  decode?: (schema: Schema, value: unknown) => unknown
  // The key and parameters the app's message for an issue carries.
  probe?: (issue: Record<string, unknown>) => { key: string; params?: Record<string, unknown> } | undefined
}

// The app's verdict function: the normalized value, or the first issue's key, parameters,
// and message.
export function oracle({ revive, decode, probe }: Options) {
  // oxlint-disable-next-line typescript/no-explicit-any -- a valibot issue
  function verdict(issue: any) {
    const recorded = probe?.(issue)
    return { ok: false, issue: { key: recorded?.key ?? null, params: recorded?.params ?? {}, message: issue.message } }
  }
  return (schema: Schema, value: unknown) => {
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
    const result = schema['~standard'].validate(reviveFor(revive, schema, structuredClone(value)))
    if (result.issues) return verdict(result.issues[0])
    return { ok: true, value: restoreDates(result.value, value) }
  }
}
