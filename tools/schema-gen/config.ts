// The port's schema-gen.json, loaded and introspected; README.md describes the fields.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Glob } from 'bun'
import { introspect } from './introspect'
import type { Ir } from './ir'
import type { RustOptions } from './rust'

export interface Config {
  app: string
  modules: string[]
  inputs: string
  probe?: string
  ir?: string
  rust: Omit<RustOptions, 'header'> & { out: string }
  differential?: {
    // A command that reads [name, value] JSON lines and answers one verdict line each.
    runner: string
    // The app's own decoder, module#export, called as decode(schema, value); without it the
    // test revives as rust.revive describes and validates.
    decode?: string
    // Values to try besides the built-in ones, such as valid ids or names.
    samples?: unknown[]
    // Sample values left out, each group with the port's reason: a known, decided
    // difference, never a way to hide one that isn't.
    exclude?: { values: unknown[]; reason: string }[]
  }
}

export interface Loaded {
  config: Config
  base: string
  app: string
  files: string[]
  probe?: (issue: Record<string, unknown>) => { key: string; params?: Record<string, unknown> } | undefined
  ir: Ir
  // oxlint-disable-next-line typescript/no-explicit-any -- valibot's schema objects
  schemas: Map<string, any>
}

export async function load(configPath: string): Promise<Loaded> {
  const base = dirname(resolve(configPath))
  const config: Config = JSON.parse(readFileSync(configPath, 'utf8'))
  const app = resolve(base, config.app)
  const files: string[] = []
  for (const pattern of config.modules) {
    const matches = Array.from(new Glob(pattern).scanSync(app)).sort()
    if (!matches.length) throw new Error(`${pattern} matches no file in ${app}`)
    for (const match of matches) if (!files.includes(match)) files.push(match)
  }
  let probe
  if (config.probe) {
    const [file, name] = config.probe.split('#')
    probe = (await import(join(app, file)))[name]
    if (typeof probe !== 'function') throw new Error(`${config.probe} is not a function`)
  }
  const inputs = new RegExp(config.inputs)
  const schemas = new Map()
  const ir = await introspect({
    app,
    modules: files.map((f) => join(app, f)),
    inputs: (name) => inputs.test(name),
    probe,
    onNode: (id, schema) => schemas.set(id, schema),
  })
  return { config, base, app, files, probe, ir, schemas }
}
