// bun tools/sql-capture/cli.ts <route-parity.json> --capture <capture.jsonl> --out <dir>
// bun tools/sql-capture/cli.ts <route-parity.json> --compare <app.jsonl> <port.jsonl> [--json <file>]
//
// Reads captures (format.ts) and joins their requests to the app's routes from the
// route-parity config. --out writes each route's SQL to a file, the porting aid for that
// route. --compare measures the app and the port per route. README.md has the details.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { readRoutes, type Source } from '../route-parity/routes'
import { analyze, median, repeated, type RouteStats } from './analyze'
import { parse } from './format'

const args = process.argv.slice(2)
const configPath = args[0]
const flag = (name: string, offset = 1) => {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args[i + offset]
}
if (!configPath || !(flag('--capture') || flag('--compare'))) {
  console.error(
    'usage: bun tools/sql-capture/cli.ts <route-parity.json> (--capture <file> --out <dir> | --compare <app> <port> [--json <file>])',
  )
  process.exit(2)
}
// Differences the port makes on purpose: extra statements per request on the routes named,
// or on every route with "*".
interface Accepted {
  reason: string
  routes: string[]
  statements: number
}
const config: {
  app: string
  env?: Record<string, string>
  sources: Source[]
  sqlCapture?: { accepted?: Accepted[] }
} = JSON.parse(
  readFileSync(configPath, 'utf8'),
)
Object.assign(process.env, config.env ?? {})
const patterns = await readRoutes(resolve(dirname(resolve(configPath)), config.app), config.sources)
const read = (file: string) => analyze(parse(readFileSync(file, 'utf8')), patterns)

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const range = (values: number[]) => {
  const low = Math.min(...values)
  const high = Math.max(...values)
  return low === high ? fmt(low) : `${fmt(median(values))} (${low}–${high})`
}

function fileName(route: string) {
  return `${route.toLowerCase().replace(/:(\w+)(\{[^}]*\})?/g, '{$1}').replace(/[^a-z0-9{}]+/g, '-').replace(/^-|-$/g, '')}.md`
}

function routeFile(stats: RouteStats) {
  const lines = [
    `# ${stats.route}`,
    '',
    stats.from === 'url' ? 'Grouped by URL: no route in the route table matches it.\n' : '',
    `| Requests | Calls | Statements | Transactions | Writes outside a transaction |`,
    `| --- | --- | --- | --- | --- |`,
    `| ${stats.requests} | ${range(stats.calls)} | ${range(stats.statements)} | ${range(stats.transactions)} | ${range(stats.looseWrites)} |`,
    '',
    `Per request: the median, and the range when requests differ.${stats.nested ? ` ${stats.nested} of them in process, from another request.` : ''}`,
    '',
    '## Statements',
    '',
  ]
  for (const shape of stats.shapes) {
    const times = shape.most > 1 ? `, **up to ${shape.most} times in one request**` : ''
    lines.push(`In ${shape.requests} of ${stats.requests} requests${times}:`, '', '```sql', shape.sql, '```', '')
  }
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n')
}

if (flag('--capture')) {
  const out = flag('--out')
  if (!out) throw new Error('--out is required with --capture')
  const { routes, outside } = read(flag('--capture')!)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const index = [
    '# SQL per route',
    '',
    `From \`${basename(flag('--capture')!)}\`. Calls and statements are medians per request.`,
    '',
    '| Route | Requests | Calls | Statements | Transactions | Repeated statements |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  for (const stats of routes) {
    writeFileSync(join(out, fileName(stats.route)), routeFile(stats))
    const loops = repeated(stats).length
    index.push(
      `| [${stats.route}](${fileName(stats.route)}) | ${stats.requests} | ${fmt(median(stats.calls))} | ${fmt(median(stats.statements))} | ${fmt(median(stats.transactions))} | ${loops || ''} |`,
    )
  }
  index.push('', `Calls outside any request: ${outside}.`, '')
  writeFileSync(join(out, 'README.md'), index.join('\n'))
  console.log(`${routes.length} routes written to ${out}`)
}

if (flag('--compare')) {
  const [appFile, portFile] = [flag('--compare'), flag('--compare', 2)]
  if (!appFile || !portFile) throw new Error('--compare takes the app capture and the port capture')
  const app = new Map(read(appFile).routes.map((r) => [r.route, r]))
  const port = new Map(read(portFile).routes.map((r) => [r.route, r]))
  const keys = [...new Set([...app.keys(), ...port.keys()])].sort()
  const rows = keys.map((route) => {
    const a = app.get(route)
    const p = port.get(route)
    const side = (s?: RouteStats) =>
      s && {
        requests: s.requests,
        calls: median(s.calls),
        statements: median(s.statements),
        transactions: median(s.transactions),
        repeated: repeated(s).length,
        looseWrites: Math.max(...s.looseWrites),
      }
    const [as, ps] = [side(a), side(p)]
    const notes: string[] = []
    if (as && ps) {
      // Medians over different traffic can differ without any change in behavior.
      if (as.requests !== ps.requests) notes.push(`${as.requests} → ${ps.requests} requests`)
      const allowed = (config.sqlCapture?.accepted ?? [])
        .filter((a) => a.routes.includes('*') || a.routes.includes(route))
        .reduce((sum, a) => sum + a.statements, 0)
      if (ps.statements > as.statements + allowed) notes.push('more statements')
      if (ps.repeated > as.repeated) notes.push('more repeated statements')
      if (ps.transactions < as.transactions) notes.push('fewer transactions')
      if (ps.looseWrites > as.looseWrites) notes.push('more writes outside a transaction')
    } else notes.push(as ? 'not in the port capture' : 'not in the app capture')
    return { route, app: as, port: ps, notes }
  })
  console.log('| Route | Calls | Statements | Transactions | Repeated | Notes |')
  console.log('| --- | --- | --- | --- | --- | --- |')
  const pair = (r: (typeof rows)[number], key: 'calls' | 'statements' | 'transactions' | 'repeated') =>
    `${r.app ? fmt(r.app[key]) : '–'} → ${r.port ? fmt(r.port[key]) : '–'}`
  for (const r of rows) {
    console.log(
      `| ${r.route} | ${pair(r, 'calls')} | ${pair(r, 'statements')} | ${pair(r, 'transactions')} | ${pair(r, 'repeated')} | ${r.notes.join('; ')} |`,
    )
  }
  const flagged = rows.filter((r) => r.notes.length > 0).length
  for (const a of config.sqlCapture?.accepted ?? []) {
    console.log(`\nAccepted: ${a.statements} more statements on ${a.routes.join(', ')}: ${a.reason}`)
  }
  console.log(`\n${rows.length} routes, ${flagged} with notes. App → port, medians per request.`)
  const json = flag('--json')
  if (json) writeFileSync(json, `${JSON.stringify(rows, null, 2)}\n`)
}
