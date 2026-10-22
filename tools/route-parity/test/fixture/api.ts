// An app's API, unrelated to any port: what the check reads.
import { Hono } from 'hono'

const items = new Hono()
  .get('/items', (c) => c.json([]))
  .post('/items', (c) => c.json({}))
  .delete('/items/:id', (c) => c.json({}))

export const api = new Hono()
  .basePath('/api')
  .use(async (_, next) => next())
  .get('/health', (c) => c.text('ok'))
  .route('/', items)
