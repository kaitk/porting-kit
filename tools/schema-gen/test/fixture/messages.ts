// A stand-in for an app's keyed messages: the message function records the key and its
// parameters on the issue, and the probe reads them back.
import type * as v from 'valibot'

type Issue = v.BaseIssue<unknown>
const recorded = new WeakMap<Issue, { key: string; params?: Record<string, string | number> }>()
const texts: Record<string, string> = {
  too_long: 'Use at most {max} characters.',
  required: 'Enter a value.',
  code_format: 'Use a code such as AB-12.',
  range: 'The end must come after the start.',
  even: 'Use an even number.',
}

export function keyed(key: string, params?: (issue: Issue) => Record<string, string | number>) {
  return (issue: Issue) => {
    const values = params?.(issue)
    recorded.set(issue, { key, params: values })
    return texts[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name]))
  }
}

export function probe(issue: Issue) {
  return recorded.get(issue)
}
