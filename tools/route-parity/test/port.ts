// A stand-in port that serves all but DELETE /api/items/:id, and answers anything else
// with its own 404.
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const { pathname } = new URL(request.url)
    const known =
      (request.method === 'GET' && pathname === '/api/health') ||
      (pathname === '/api/items' && ['GET', 'POST'].includes(request.method))
    return known ? Response.json({ ok: true }, { status: 401 }) : Response.json({ error: 'No such call.' }, { status: 404 })
  },
})
console.log(`http://127.0.0.1:${server.port}`)
