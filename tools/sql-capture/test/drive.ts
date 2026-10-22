// bun drive.ts <capture.jsonl>: serves the fixture API with the libsql adapter connected,
// as an app's capture patch would, and sends it a few requests. A request outside the API
// stands in for a page, which the route table doesn't list, and calls the API in process.
import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [capture] = process.argv.slice(2)
if (!capture) throw new Error('usage: bun drive.ts <capture.jsonl>')
rmSync(capture, { force: true })
process.env.SQL_CAPTURE = capture
// The adapter reads SQL_CAPTURE when it loads.
const { captureClient, captureRequest } = await import('../libsql')
const { api, useDatabase } = await import('./fixture/api')

const dir = mkdtempSync(join(tmpdir(), 'sql-capture-'))
const client = captureClient(createClient({ url: `file:${join(dir, 'app.db')}` }))
await client.executeMultiple(`
  create table project (id integer primary key, name text);
  create table entry (id integer primary key, project_id integer);
  create table audit (id integer primary key, what text);
  insert into project (name) values ('a'), ('b'), ('c'), ('d');
  insert into entry (project_id) values (1), (1), (2), (4);
`)
useDatabase(client)

async function serve(request: Request) {
  return captureRequest(request, async () => {
    if (new URL(request.url).pathname.startsWith('/api/')) return api.fetch(request)
    await client.execute({ sql: 'select name from project where id = ?', args: [1] })
    // The page's loader calls the API in process.
    await captureRequest({ method: 'GET', url: '/api/projects/1' }, () => api.request('/api/projects/1'))
    return new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
  })
}

const base = 'http://fixture'
for (let i = 0; i < 2; i++) await serve(new Request(`${base}/api/projects`))
await serve(new Request(`${base}/api/projects/2`))
await serve(new Request(`${base}/api/projects/9`))
const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"e"}' }
await serve(new Request(`${base}/api/projects`, post))
await serve(new Request(`${base}/projects/12/report`))
client.close()
rmSync(dir, { recursive: true, force: true })
