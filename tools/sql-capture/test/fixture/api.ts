// An app's API, unrelated to any port, with the problems the tool should find: listing
// projects runs one query per project, and creating one writes twice outside a transaction.
// With FIXED set, it stands in for a port that fixed both.
import type { Client } from '@libsql/client'
import { Hono } from 'hono'

let db: Client
export function useDatabase(client: Client) {
  db = client
}

const fixed = Boolean(process.env.FIXED)

export const api = new Hono()
  .basePath('/api')
  .get('/projects', async (c) => {
    if (fixed) {
      const rows = await db.execute(
        'select p.id, p.name, count(e.id) as entries from project p left join entry e on e.project_id = p.id group by p.id',
      )
      return c.json(rows.rows)
    }
    const projects = await db.execute('select id, name from project')
    const result = []
    for (const p of projects.rows) {
      const count = await db.execute({ sql: 'select count(*) as n from entry where project_id = ?', args: [p.id] })
      result.push({ ...p, entries: count.rows[0].n })
    }
    return c.json(result)
  })
  .get('/projects/:id', async (c) => {
    const rows = await db.execute({ sql: 'select id, name from project where id = ?', args: [c.req.param('id')] })
    return rows.rows[0] ? c.json(rows.rows[0]) : c.notFound()
  })
  .post('/projects', async (c) => {
    const { name } = await c.req.json<{ name: string }>()
    if (fixed) {
      const tx = await db.transaction('write')
      await tx.execute({ sql: 'insert into project (name) values (?)', args: [name] })
      await tx.execute({ sql: 'insert into audit (what) values (?)', args: [`created ${name}`] })
      await tx.commit()
    } else {
      await db.execute({ sql: 'insert into project (name) values (?)', args: [name] })
      await db.execute({ sql: 'insert into audit (what) values (?)', args: [`created ${name}`] })
    }
    return c.json({ ok: true }, 201)
  })
