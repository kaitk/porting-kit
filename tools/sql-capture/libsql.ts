// The capture adapter for @libsql/client. An app connects it in two places, in a patch
// applied only for a capture run: captureClient() around the client it opens, and
// captureRequest() around each request it serves. With SQL_CAPTURE unset, both do nothing.
// It imports nothing from the app or the kit, so a port can copy it into the app's source.
import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFileSync } from 'node:fs'

// Matches format.ts; repeated so the file stands alone.
interface Statement {
  sql: string
  params: number
}

type Kind = 'statement' | 'batch' | 'script' | 'begin' | 'commit' | 'rollback'

const file = process.env.SQL_CAPTURE
const requests = new AsyncLocalStorage<string>()
let sequence = 0

function write(line: object) {
  if (file) appendFileSync(file, `${JSON.stringify(line)}\n`)
}

function next(prefix: string) {
  return `${prefix}${process.pid}.${++sequence}`
}

function count(args: unknown): number {
  if (Array.isArray(args)) return args.length
  return args && typeof args === 'object' ? Object.keys(args).length : 0
}

// A statement in any of the client's forms: text, text and args, { sql, args }, or [sql, args].
function statement(stmt: unknown, args?: unknown): Statement {
  if (typeof stmt === 'string') return { sql: stmt, params: count(args) }
  if (Array.isArray(stmt)) return { sql: String(stmt[0]), params: count(stmt[1]) }
  const { sql, args: bound } = stmt as { sql: string; args?: unknown }
  return { sql, params: count(bound) }
}

async function record<T>(kind: Kind, statements: Statement[], tx: string | undefined, fn: () => Promise<T>) {
  const started = performance.now()
  try {
    return await fn()
  } finally {
    write({ kind, request: requests.getStore(), tx, statements, ms: performance.now() - started })
  }
}

// oxlint-disable-next-line typescript/no-explicit-any -- the client's methods, read structurally
type Any = any

function wrap<T extends object>(target: T, tx: string | undefined): T {
  return new Proxy(target, {
    get(object, key) {
      const value: Any = Reflect.get(object, key, object)
      if (typeof value !== 'function') return value
      function call(...args: Any[]) {
        return value.apply(object, args)
      }
      switch (key) {
        case 'execute':
          return (...args: Any[]) => record('statement', [statement(args[0], args[1])], tx, () => call(...args))
        case 'batch':
          return (...args: Any[]) =>
            record('batch', (args[0] as unknown[]).map((s) => statement(s)), tx, () => call(...args))
        case 'executeMultiple':
          return (...args: Any[]) => record('script', [{ sql: args[0], params: 0 }], tx, () => call(...args))
        case 'commit':
        case 'rollback':
          return (...args: Any[]) => record(key, [], tx, () => call(...args))
        case 'transaction':
          return async (...args: Any[]) => {
            const id = next('t')
            const opened = await record<object>('begin', [{ sql: `begin ${args[0] ?? 'deferred'}`, params: 0 }], id, () =>
              call(...args),
            )
            return wrap(opened, id)
          }
        default:
          return value.bind(object)
      }
    },
  })
}

// The client with each call written to SQL_CAPTURE.
export function captureClient<T extends object>(client: T): T {
  return file ? wrap(client, undefined) : client
}

// Runs fn as one request: the calls it makes carry the request's id, and a line with the
// request's method, URL, and status follows its calls. A request made in process while
// another runs, such as a page loader's call to the API, is its own request with that one
// as its parent; its url may be a path.
export async function captureRequest(
  request: { method: string; url: string },
  fn: () => Promise<Response>,
): Promise<Response> {
  if (!file) return fn()
  const id = next('r')
  const parent = requests.getStore()
  const started = performance.now()
  const url = new URL(request.url, 'http://in-process')
  let status = 0
  try {
    const response = await requests.run(id, fn)
    status = response.status
    return response
  } finally {
    write({
      kind: 'request',
      request: id,
      parent,
      method: request.method,
      url: url.pathname + url.search,
      status,
      ms: performance.now() - started,
    })
  }
}
