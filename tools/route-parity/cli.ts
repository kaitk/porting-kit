// bun tools/route-parity/cli.ts <config.json> --url <port's base URL> [--json <file>]
// bun tools/route-parity/cli.ts <config.json> --list
//
// Lists the app's routes from its own routers and calls each on a running port, without a
// session, to tell which the port implements. A route the port answers the way it answers
// a path that can't exist under the same prefix is missing; README.md has the details.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { readRoutes, type Route, type Source } from './routes'

interface Config {
  app: string
  // Environment the app's modules need to import, such as dummy secrets.
  env?: Record<string, string>
  sources: Source[]
  // Values for path parameters, by name; others get "x".
  params?: Record<string, string>
  // Routes the port leaves out on purpose, each group with its reason: "METHOD /path".
  omitted?: { reason: string; routes: string[] }[]
}

const args = process.argv.slice(2)
const configPath = args[0]
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args[i + 1]
}
if (!configPath) {
  console.error('usage: bun tools/route-parity/cli.ts <config.json> (--url <base> [--json <file>] | --list)')
  process.exit(2)
}
const config: Config = JSON.parse(readFileSync(configPath, 'utf8'))
Object.assign(process.env, config.env ?? {})
const app = resolve(dirname(resolve(configPath)), config.app)
const routes = await readRoutes(app, config.sources)
const omitted = new Map<string, string>()
for (const group of config.omitted ?? []) for (const key of group.routes) omitted.set(key, group.reason)

if (args.includes('--list')) {
  for (const r of routes) console.log(`${r.method.padEnd(6)} ${r.path}`)
  console.log(`${routes.length} routes`)
  process.exit(0)
}

const base = flag('--url')
if (!base) throw new Error('--url is required')

function fill(path: string) {
  return path
    .replace(/:(\w+)(\{[^}]*\})?/g, (_, name: string) => encodeURIComponent(config.params?.[name] ?? 'x'))
    .replace(/\*/g, 'x')
}

async function call(method: string, path: string) {
  try {
    const response = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
    })
    return { status: response.status, body: await response.text() }
  } catch (error) {
    return { status: 0, body: String(error) }
  }
}

// The prefix the routes of one source share, such as /api/v1.
function prefix(paths: string[]) {
  const parts = paths.map((p) => p.split('/'))
  const common: string[] = []
  for (let i = 0; parts.every((p) => p[i] !== undefined && p[i] === parts[0][i] && !p[i].startsWith(':')); i++) {
    common.push(parts[0][i])
  }
  return common.join('/')
}

// How the port answers a path that can't exist under each source's prefix, per method.
const unknown = new Map<string, Set<string>>()
for (const source of config.sources) {
  const at = prefix(routes.filter((r) => r.source === source.module).map((r) => r.path))
  const answers = new Set<string>()
  for (const method of ['GET', 'POST']) {
    const answer = await call(method, `${at}/__no-such-route__/x`)
    answers.add(`${answer.status} ${answer.body}`)
  }
  unknown.set(source.module, answers)
}

type Verdict = 'implemented' | 'missing' | 'inconclusive'
const results: (Route & { verdict: Verdict; status: number; omitted?: string })[] = []
for (const route of routes) {
  const answer = await call(route.method, fill(route.path))
  let verdict: Verdict = 'implemented'
  if (answer.status === 0 || answer.status === 429 || answer.status >= 500) verdict = 'inconclusive'
  else if (answer.status === 405 || unknown.get(route.source)!.has(`${answer.status} ${answer.body}`)) {
    verdict = 'missing'
  }
  results.push({ ...route, verdict, status: answer.status, omitted: omitted.get(`${route.method} ${route.path}`) })
}

const listed = new Set(routes.map((r) => `${r.method} ${r.path}`))
const unknownOmissions = [...omitted.keys()].filter((k) => !listed.has(k))
const problems = results.filter(
  (r) => (r.verdict === 'missing' && !r.omitted) || (r.verdict === 'implemented' && r.omitted) || r.verdict === 'inconclusive',
)

for (const r of results) {
  const mark = r.verdict === 'implemented' ? (r.omitted ? 'STALE' : 'ok') : r.verdict === 'missing' ? (r.omitted ? 'omit' : 'MISS') : '??'
  if (mark !== 'omit') console.log(`${mark.padEnd(5)} ${r.method.padEnd(6)} ${r.path}  (${r.status})`)
}
for (const key of unknownOmissions) console.log(`STALE ${key}: omitted, but the app has no such route`)
const count = (v: Verdict) => results.filter((r) => r.verdict === v).length
for (const group of config.omitted ?? []) console.log(`omitted (${group.routes.length}): ${group.reason}`)
console.log(
  `${routes.length} routes: ${count('implemented')} implemented, ${count('missing')} missing (${results.filter((r) => r.verdict === 'missing' && r.omitted).length} omitted on purpose), ${count('inconclusive')} inconclusive`,
)

const json = flag('--json')
if (json) writeFileSync(json, `${JSON.stringify(results, null, 2)}\n`)
process.exit(problems.length || unknownOmissions.length ? 1 : 0)
