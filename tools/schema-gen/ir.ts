// The schema IR: what introspect.ts reads from valibot and the emitters write from. Nodes
// are shared by id, as the app shares schema objects, so a building block such as an id
// pattern is described once.

export interface Ir {
  version: 1
  // The input schemas to emit, in module order.
  inputs: { module: string; file: string; name: string; node: string }[]
  nodes: Record<string, Node>
}

export interface Owner {
  module: string
  name: string
}

export interface Node {
  id: string
  // Valibot's schema type: string, number, boolean, date, literal, picklist, object,
  // loose_object, array, union, variant, unknown, any, optional, nullable, nullish,
  // exact_optional.
  type: string
  // Valibot's expects, which its type messages quote.
  expects: string
  // The export that names this node, if any.
  export?: Owner
  // The message of the schema's own type issue (and, for objects, of a missing key).
  message?: Message
  wrapped?: string
  default?: unknown
  literal?: unknown
  options?: unknown[]
  entries?: { key: string; node: string }[]
  item?: string
  // A union's or a variant's options.
  union?: string[]
  // A variant's discriminator key.
  key?: string
  pipe?: Action[]
}

export interface Action {
  // trim, trim_start, trim_end, to_lower_case, to_upper_case, transform (a hook), or a
  // validation: min_length, max_length, length, non_empty, regex, iso_date, email, integer,
  // min_value, max_value, check, partial_check.
  type: string
  label?: string
  expects?: string | null
  message?: Message
  requirement?: number
  regex?: { source: string; flags: string }
  // A check or transform the generator cannot translate: the port writes the function by
  // this name.
  hook?: { name: string; module: string; source: string }
}

// A message as the app gives it: valibot's default ("Invalid <label>: …"), or a fixed text,
// with the key and parameters the app's probe recorded.
export interface Message {
  default?: string
  text?: string
  key?: string
  params?: Record<string, string | number>
}
