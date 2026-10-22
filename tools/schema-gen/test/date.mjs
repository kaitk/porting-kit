// js_date.rs against Node's Date.parse, in this process's time zone, which must have a fixed
// offset (DST is the port's to_utc, not the parser's): a corpus of the forms V8 knows,
// strings built at random from date-like pieces, and date-shaped strings, most of which parse. Run with node, under TZ=... (run.sh).
import { spawnSync } from 'node:child_process'

const corpus = [
  '', ' ', '2026', '2026-10', '2026-10-22', '2026-10-22T10:00', '2026-10-22T10:00:05.123Z',
  '2026-10-22T10:00+02:00', '2026-10-22T10:00+0200', '2026-10-22T24:00', '2026-10-22T24:01',
  '+002026-10-22', '-000000-01-01', '-000001-01-01', '+275760-09-13T00:00:00Z',
  '+275760-09-13T00:00:01Z', '2026-9-24', '2026-02-30', '-1', '0', '1', '7', '12', '13', '31',
  '32', '49', '50', '99', '100', '1.5', 'ABC-123', 'abc-123', '10/22/2026', '22/10/2026',
  'Oct 22 2026', 'October 22, 2026 10:00 AM', '22 Oct 2026 10:00:00 GMT+0200',
  'Thu, 22 Oct 2026 10:00:00 GMT', 'Thu Oct 22 2026 10:00:00 GMT+0300 (Eastern European)',
  '2026/10/22 12:00 pm', '12:00 am 2026-10-22', 'Oct 22', '22 Oct', 'Oct', '2026 Oct 22',
  'Oct 2026 22', '10:00', '10:00 2026-10-22', '2026-10-22 10:00', '2026-10-22 10:00:00.5',
  '2026-10-22 10:00 Z', '2026-10-22 10:00 UTC+3', '2026-10-22 10:00 PST', 'Jan 1 2000 GMT+596523:',
  'Jan 1 2000 10:00 GMT+596524:', 'Jan 1 2000 GMT+12345', '1 2 3 4', '2026-10-22T10:00:00.123456789',
  ' 2026-10-22', '2026 -10-22', 'Ｊan 1 2000', '(note) Oct 22 2026', 'Oct 22 2026 (x(y)z)',
  'T10:00', '2026-10-22t10:00', '2026-10-22T10', 'Sat, 01-Jan-2000 08:00:00 GMT', '1/1/1970 00:00:00 UTC-1',
]

let seed = 20261022
function random(n) {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed % n
}
const pieces = [
  '2026', '1970', '0', '1', '9', '10', '12', '22', '24', '31', '59', '60', '99', '100', '275760',
  '000123', '1234567890', '-', '+', ':', '::', '.', '/', ',', ' ', '  ', 'T', 't', 'Z', 'z', 'GMT',
  'UTC', 'UT', 'PST', 'pdt', 'Jan', 'oct', 'Sept', 'May', 'am', 'PM', 'Thu', 'x', '(', ')', '(a)',
  '_', '[', '`', '@', ' ', '\t', '\n', ' ', '﻿', 'é',
]
for (let i = 0; i < 20000; i++) {
  let text = ''
  for (let n = 1 + random(9); n > 0; n--) text += pieces[random(pieces.length)]
  corpus.push(text)
}

// Date-shaped strings, most of which parse: parts in date, time, and zone positions.
const pick = (list) => list[random(list.length)]
const num = (max, width = 0) => String(random(max + 1)).padStart(width ? random(width + 1) : 0, '0')
for (let i = 0; i < 20000; i++) {
  const day = [num(31), pick(['Jan', 'Feb', 'mar', 'APR', 'June', 'Sept', 'oct', 'Dec', num(13)]), num(9999, 4)]
  if (random(2)) day.reverse()
  if (random(3) === 0) day.splice(random(3), 1)
  let text = (random(4) === 0 ? pick(['Thu, ', 'Mon ', 'x ']) : '') + day.join(pick([' ', '/', '-', ', ', '.']))
  if (random(2)) {
    text += pick([' ', 'T', ' at ']) + num(25, 2) + ':' + num(60, 2)
    if (random(2)) text += ':' + num(60, 2) + (random(2) ? '.' + num(999999) : '')
    if (random(3) === 0) text += pick([' am', ' PM', 'pm'])
  }
  if (random(2)) text += pick([' GMT', ' UTC', 'Z', ' PST', ' EDT', '']) + pick(['+', '-', '']) + pick([num(14), num(1400, 4), num(14, 2) + ':' + num(59, 2), ''])
  if (random(5) === 0) text += pick([' (EET)', ')', ' +', '  '])
  corpus.push(text)
}

const offset = -new Date(0).getTimezoneOffset()
if (offset !== -new Date(8e14).getTimezoneOffset()) throw new Error('TZ must have a fixed offset')
const rust = spawnSync('cargo', ['run', '-q', '--manifest-path', 'rust/Cargo.toml', '--', '--date-parse', String(offset)], {
  input: corpus.map((s) => JSON.stringify(s)).join('\n') + '\n',
  encoding: 'utf8',
  maxBuffer: 1 << 26,
})
if (rust.status !== 0) throw new Error(rust.stderr)
const answers = rust.stdout.trim().split('\n').map((l) => JSON.parse(l))
let differ = 0
corpus.forEach((text, i) => {
  const node = Date.parse(text)
  const expected = Number.isNaN(node) ? null : node
  if (answers[i] !== expected) {
    if (differ++ < 20) console.log(`differs: ${JSON.stringify(text)}: node ${expected}, rust ${answers[i]}`)
  }
})
const parsed = answers.filter((a) => a !== null).length
console.log(`${corpus.length - differ}/${corpus.length} dates match in ${process.env.TZ ?? 'local time'} (${parsed} parse)`)
if (differ) process.exit(1)
