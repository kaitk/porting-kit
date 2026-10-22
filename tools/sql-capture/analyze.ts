// Groups a capture's calls by request and its requests by route, and measures each route:
// calls (round trips for a networked database), statements, transactions, statements
// repeated within one request, and writes outside a transaction.
import { type Call, isWrite, kindOf, type Line, normalize, type Request } from './format'

export interface Pattern {
  method: string
  // Hono's form: /items/:id, /items/:id{[0-9]+}, /files/*
  path: string
}

export interface Shape {
  sql: string
  // Requests that ran it, and the most times one request ran it.
  requests: number
  most: number
}

export interface RouteStats {
  route: string
  // 'route' when the route table names it, 'url' when grouped by URL, as pages are.
  from: 'route' | 'url'
  requests: number
  // Requests made in process by another, such as a page loader's calls to the API.
  nested: number
  calls: number[]
  statements: number[]
  transactions: number[]
  // Writes outside a transaction in a request that writes more than once.
  looseWrites: number[]
  shapes: Shape[]
}

function matcher(pattern: Pattern) {
  const parts = pattern.path.split('/').map((part) => {
    if (part === '*') return '.*'
    const param = /^:\w+(\{(.+)\})?$/.exec(part)
    if (param) return param[2] ? `(?:${param[2]})` : '[^/]+'
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  })
  const literal = pattern.path.split('/').filter((p) => p && !p.startsWith(':') && p !== '*').length
  return { pattern, regex: new RegExp(`^${parts.join('/')}/?$`), literal }
}

// A URL's group when no route matches it: segments that look like ids become :id.
function urlGroup(method: string, path: string) {
  const id = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27}|(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,})$/i
  return `${method} ${path.split('/').map((s) => (id.test(s) ? ':id' : s)).join('/')}`
}

export function routeOf(patterns: Pattern[]) {
  const matchers = patterns.map(matcher).sort((a, b) => b.literal - a.literal)
  return (method: string, url: string): { route: string; from: 'route' | 'url' } => {
    const path = url.split('?')[0]
    const m = matchers.find((m) => (m.pattern.method === method || (method === 'HEAD' && m.pattern.method === 'GET')) && m.regex.test(path))
    return m ? { route: `${m.pattern.method} ${m.pattern.path}`, from: 'route' } : { route: urlGroup(method, path), from: 'url' }
  }
}

export function analyze(lines: Line[], patterns: Pattern[]): { routes: RouteStats[]; outside: number } {
  const route = routeOf(patterns)
  const calls = new Map<string, Call[]>()
  let outside = 0
  for (const line of lines) {
    if (line.kind === 'request') continue
    if (!line.request) {
      outside++
      continue
    }
    calls.set(line.request, [...(calls.get(line.request) ?? []), line])
  }
  const byRoute = new Map<string, RouteStats>()
  const shapes = new Map<string, Map<string, Shape>>()
  for (const request of lines.filter((l): l is Request => l.kind === 'request')) {
    const { route: key, from } = route(request.method, request.url)
    const stats = byRoute.get(key) ?? {
      route: key,
      from,
      requests: 0,
      nested: 0,
      calls: [],
      statements: [],
      transactions: [],
      looseWrites: [],
      shapes: [],
    }
    byRoute.set(key, stats)
    const own = calls.get(request.request) ?? []
    stats.requests++
    if (request.parent) stats.nested++
    stats.calls.push(own.length)
    let statements = 0
    let transactions = 0
    let writes = 0
    let loose = 0
    // SQLite and Postgres report a transaction as begin and commit statements.
    let open = false
    const seen = new Map<string, number>()
    for (const call of own) {
      const kind = kindOf(call)
      if (kind === 'begin') {
        transactions++
        open = true
        continue
      }
      if (kind === 'commit' || kind === 'rollback') {
        open = false
        continue
      }
      for (const s of call.statements) {
        statements++
        const sql = normalize(s.sql)
        seen.set(sql, (seen.get(sql) ?? 0) + 1)
        if (isWrite(sql)) {
          writes++
          if (!call.tx && !open && call.kind !== 'batch') loose++
        }
      }
    }
    stats.statements.push(statements)
    stats.transactions.push(transactions)
    stats.looseWrites.push(writes > 1 ? loose : 0)
    const routeShapes = shapes.get(key) ?? new Map<string, Shape>()
    shapes.set(key, routeShapes)
    for (const [sql, times] of seen) {
      const shape = routeShapes.get(sql) ?? { sql, requests: 0, most: 0 }
      shape.requests++
      shape.most = Math.max(shape.most, times)
      routeShapes.set(sql, shape)
    }
  }
  for (const [key, stats] of byRoute) stats.shapes = [...(shapes.get(key)?.values() ?? [])]
  return { routes: [...byRoute.values()].sort((a, b) => a.route.localeCompare(b.route)), outside }
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// The statements a route repeats within one request: likely N+1 queries or queries in a loop.
export function repeated(stats: RouteStats): Shape[] {
  return stats.shapes.filter((s) => s.most > 1)
}
