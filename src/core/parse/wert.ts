import type { ParsedWert } from '../types'

const LESS_THAN_RE = /^<\s*(\d+\.?\d*)$/
const GREATER_THAN_RE = /^>\s*(\d+\.?\d*)$/
const RANGE_RE = /^(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)$/
const PLAIN_NUMBER_RE = /^-?\d+\.?\d*([eE]-?\d+)?$/
const AMBIGUOUS_DOT_THOUSANDS_RE = /^-?\d{1,3}\.\d{3}$/

export function parseWert(raw: string | null): ParsedWert {
  if (raw === null || raw.trim() === '') {
    return { value: null, operator: 'unparseable', raw: '' }
  }
  // Replace non-breaking (U+00A0) and narrow no-break (U+202F) spaces with a
  // regular space, map unicode ≤/≥ to </>, then trim. NOTE: the Python source
  // intended this space normalisation but its `.replace(" ", " ")` is a no-op
  // (both operands are U+0020); we implement the intended behaviour, so interior
  // NBSP values like "< 30" parse here though Python leaves them unparseable.
  let normalized = raw
    .replace(/ /g, ' ')
    .replace(/ /g, ' ')
    .replace(/≤/g, '<')
    .replace(/≥/g, '>')
    .trim()

  if (normalized.includes('.') && normalized.includes(',')) {
    return { value: null, operator: 'unparseable', raw }
  }
  if (!normalized.includes(',') && AMBIGUOUS_DOT_THOUSANDS_RE.test(normalized)) {
    return { value: null, operator: 'unparseable', raw }
  }
  normalized = normalized.replace(/,/g, '.')

  // Digits that overflow a double (e.g. "1e400") would become ±Infinity and
  // break every later computation; they are reported as unparseable instead.
  const finite = (value: number, operator: ParsedWert['operator']): ParsedWert =>
    Number.isFinite(value) ? { value, operator, raw } : { value: null, operator: 'unparseable', raw }
  let m: RegExpMatchArray | null
  if ((m = normalized.match(LESS_THAN_RE))) {
    return finite(parseFloat(m[1]), '<')
  }
  if ((m = normalized.match(GREATER_THAN_RE))) {
    return finite(parseFloat(m[1]), '>')
  }
  if (RANGE_RE.test(normalized)) {
    return { value: null, operator: 'range', raw }
  }
  if (PLAIN_NUMBER_RE.test(normalized)) {
    return finite(parseFloat(normalized), '=')
  }
  return { value: null, operator: 'unparseable', raw }
}
