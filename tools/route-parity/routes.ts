// The app's HTTP routes, read from its own router objects at run time: a Hono app's route
// table, and a Better Auth instance's endpoints. Each reader answers method and path
// pairs, with path parameters in Hono's `:name` form.
import { join } from 'node:path'

export interface Route {
  method: string
  path: string
  source: string
}

export interface Source {
  // hono: a Hono app; better-auth: an auth instance from betterAuth().
  kind: 'hono' | 'better-auth'
  // file#export, relative to the app.
  module: string
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

async function load(app: string, module: string) {
  const [file, name] = module.split('#')
  const value = (await import(join(app, file)))[name]
  if (!value) throw new Error(`${module} exports nothing by that name`)
  return value
}

// oxlint-disable-next-line typescript/no-explicit-any -- the app's objects, read structurally
type Any = any

function fromHono(router: Any, source: string): Route[] {
  // Middleware is registered as ALL; a route's own middleware repeats its method and path.
  return (router.routes as Any[])
    .filter((r) => METHODS.has(r.method))
    .map((r) => ({ method: r.method, path: r.path, source }))
}

function fromBetterAuth(auth: Any, source: string): Route[] {
  const base: string = auth.options?.basePath ?? '/api/auth'
  const disabled = new Set<string>(auth.options?.disabledPaths ?? [])
  const routes: Route[] = []
  for (const endpoint of Object.values(auth.api) as Any[]) {
    const metadata = endpoint?.options?.metadata ?? {}
    if (!endpoint?.path || metadata.SERVER_ONLY || metadata.isAction === false) continue
    if (disabled.has(endpoint.path)) continue
    for (const method of [endpoint.options.method].flat()) {
      if (METHODS.has(method)) routes.push({ method, path: base + endpoint.path, source })
    }
  }
  return routes
}

export async function readRoutes(app: string, sources: Source[]): Promise<Route[]> {
  const all: Route[] = []
  for (const source of sources) {
    const value = await load(app, source.module)
    all.push(...(source.kind === 'hono' ? fromHono(value, source.module) : fromBetterAuth(value, source.module)))
  }
  const unique = new Map(all.map((r) => [`${r.method} ${r.path}`, r]))
  return [...unique.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
}
