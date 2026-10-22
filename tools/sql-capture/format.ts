// The capture format: one JSON line per database call or finished request. Adapters for
// each driver write it; the CLI reads it. README.md describes the fields.

export interface Statement {
  sql: string
  // Bound parameters; values are left out.
  params: number
}

export interface Call {
  kind: 'statement' | 'batch' | 'script' | 'begin' | 'commit' | 'rollback'
  // The request that made the call; none for startup and background work.
  request?: string
  // The transaction the call ran in, if any.
  tx?: string
  statements: Statement[]
  ms: number
}

export interface Request {
  kind: 'request'
  request: string
  // The request this one ran inside, in process.
  parent?: string
  method: string
  // The path and query string.
  url: string
  status: number
  ms: number
}

export type Line = Call | Request

export function parse(text: string): Line[] {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line) as Line
      } catch {
        throw new Error(`line ${i + 1} is not JSON`)
      }
    })
}

// A statement's call kind from its text, for drivers that report transaction control as
// plain statements, such as SQLite's trace hook and Postgres.
export function kindOf(call: Call): Call['kind'] {
  if (call.kind !== 'statement') return call.kind
  const sql = call.statements[0]?.sql.trimStart().toLowerCase() ?? ''
  if (/^begin\b|^start transaction\b|^savepoint\b/.test(sql)) return 'begin'
  if (/^(commit|end)\b|^release\b/.test(sql)) return 'commit'
  if (/^rollback\b/.test(sql)) return 'rollback'
  return 'statement'
}

// The text two calls of the same statement share: whitespace collapsed, placeholders
// unnumbered, and lists of placeholders, in-lists of one included, folded to one.
export function normalize(sql: string): string {
  return sql
    .replace(/\s+/g, ' ')
    .trim()
    // Named parameters, but not Postgres casts (::text) or times in literals ('10:00').
    .replace(/\$\d+|\?\d+|(?<![:\w])[:@][A-Za-z_]\w*/g, '?')
    .replace(/\(\s*\?(\s*,\s*\?)+\s*\)/g, '(?, …)')
    // An in-list of one is the same statement as a longer one.
    .replace(/\bin \(\?\)/gi, 'in (?, …)')
}

export function isWrite(sql: string): boolean {
  return /^\s*(with\b[\s\S]*?\b)?(insert|update|delete|replace|upsert)\b/i.test(sql)
}
