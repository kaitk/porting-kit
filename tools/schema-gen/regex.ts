// Translates a JavaScript regex into the regex crate's syntax, or says why it can't.
// Character classes become ASCII, as JavaScript's are; lookaround and backreferences have no
// regex-crate form. Known differences that remain: without the u flag JavaScript matches
// UTF-16 units, so `.` or a negated class takes half of an astral character where Rust takes
// all of it, and /i folds case with Unicode's simple folding in Rust.

const SPACE = '\\t\\n\\x0B\\f\\r \\x{A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}'
const CLASSES: Record<string, string> = { d: '0-9', w: '0-9A-Za-z_', s: SPACE }

export function translateRegex(source: string, flags: string): { pattern: string } | { problem: string } {
  for (const flag of flags) {
    if (flag === 'g' || flag === 'y') return { problem: `the ${flag} flag makes test() stateful` }
    if (flag === 'v') return { problem: 'the v flag' }
  }
  const dotAll = flags.includes('s')
  let out = ''
  let inClass = false
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '\\') {
      const next = source[++i]
      if (next === undefined) return { problem: 'a trailing backslash' }
      const lower = next.toLowerCase()
      if (lower in CLASSES) {
        const negated = next !== lower
        if (inClass) {
          if (negated) return { problem: `\\${next} inside a class` }
          out += CLASSES[lower]
        } else {
          out += `[${negated ? '^' : ''}${CLASSES[lower]}]`
        }
      } else if (next === 'b' || next === 'B') {
        if (inClass) return { problem: '\\b inside a class' }
        out += `(?-u:\\${next})`
      } else if (/[1-9k]/.test(next)) {
        return { problem: 'a backreference' }
      } else if (next === 'c' || next === 'p' || next === 'P') {
        return { problem: `\\${next}` }
      } else if (next === 'u' && source[i + 1] === '{') {
        const end = source.indexOf('}', i)
        out += `\\x{${source.slice(i + 2, end)}}`
        i = end
      } else if (next === 'u') {
        out += `\\x{${source.slice(i + 1, i + 5)}}`
        i += 4
      } else if (next === 'x') {
        out += `\\x{${source.slice(i + 1, i + 3)}}`
        i += 2
      } else if (next === '0') {
        out += '\\x{0}'
      } else if (/[a-zA-Z]/.test(next) && !'fnrtv'.includes(next)) {
        return { problem: `\\${next}` }
      } else if (next === 'v') {
        out += '\\x0B'
      } else if (/[a-zA-Z0-9]/.test(next)) {
        out += `\\${next}`
      } else {
        // An escaped punctuation character stands for itself.
        out += /[\\.+*?()|[\]{}^$#&\-~]/.test(next) ? `\\${next}` : next
      }
      continue
    }
    if (inClass) {
      if (c === ']') inClass = false
      // The regex crate reads these as nested classes or set operations.
      out += c === '[' || c === '&' || c === '~' ? `\\${c}` : c
      continue
    }
    if (c === '[') {
      inClass = true
      out += c
      if (source[i + 1] === '^') out += source[++i]
      // JavaScript's [] matches nothing and [^] anything; a leading ] closes the class.
      if (source[i + 1] === ']') {
        i++
        out = out.endsWith('^') ? `${out.slice(0, -2)}(?s:.)` : `${out.slice(0, -1)}[^\\x{0}-\\x{10FFFF}]`
        inClass = false
      }
      continue
    }
    if (c === '(' && source[i + 1] === '?') {
      const kind = source.slice(i + 2, i + 4)
      if (kind[0] === '=' || kind[0] === '!' || kind === '<=' || kind === '<!') {
        return { problem: 'lookaround' }
      }
    }
    if (c === '.' && !dotAll) {
      out += '[^\\n\\r\\x{2028}\\x{2029}]'
      continue
    }
    if (c === '{' && !/^\{\d+(,\d*)?\}/.test(source.slice(i))) {
      out += '\\{'
      continue
    }
    if (c === '}' && !/\{\d+(,\d*)?$/.test(source.slice(0, i))) {
      out += '\\}'
      continue
    }
    out += c
  }
  const prefix = (flags.includes('i') ? 'i' : '') + (flags.includes('m') ? 'm' : '') + (dotAll ? 's' : '')
  return { pattern: prefix ? `(?${prefix})${out}` : out }
}
