// Inputs that exercise what the generator supports, unrelated to any port.
import * as v from 'valibot'
import { keyed } from './messages'

const Code = v.pipe(
  v.string(),
  v.trim(),
  v.toUpperCase(),
  v.regex(/^[a-z]{2}-\d{1,4}$/i, keyed('code_format')),
)

const Note = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty(keyed('required')),
  v.maxLength(20, keyed('too_long', (issue) => ({ max: Number(issue.requirement) }))),
)

const Line = v.object({
  code: Code,
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(99)),
  gift: v.optional(v.boolean(), false),
})

export const CreateOrderInput = v.pipe(
  v.object({
    id: v.pipe(v.string(), v.regex(/^\d+$/)),
    lines: v.pipe(v.array(Line), v.minLength(1)),
    note: v.nullish(Note),
    priority: v.optional(v.picklist(['low', 'normal', 'high']), 'normal'),
    from: v.date(),
    to: v.optional(v.date()),
    tag: v.union([Code, v.literal('none')]),
    count: v.optional(v.pipe(v.number(), v.check((n) => n % 2 === 0, keyed('even')))),
  }),
  v.check((i) => !i.to || i.to > i.from, keyed('range')),
)

const Target = v.variant('kind', [
  v.object({ kind: v.literal('user'), id: v.pipe(v.string(), v.minLength(3)) }),
  v.object({ kind: v.literal('team'), id: v.string(), lead: v.optional(v.boolean()) }),
])

export const ShareInput = v.object({
  target: Target,
  message: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.transform((text) => text || null),
    ),
  ),
  flags: v.optional(v.array(v.picklist([1, 2, 3]))),
  extra: v.optional(v.looseObject({ seen: v.boolean() })),
})
