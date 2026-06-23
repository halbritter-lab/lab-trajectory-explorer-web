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

  let m: RegExpMatchArray | null
  if ((m = normalized.match(LESS_THAN_RE))) {
    return { value: parseFloat(m[1]), operator: '<', raw }
  }
  if ((m = normalized.match(GREATER_THAN_RE))) {
    return { value: parseFloat(m[1]), operator: '>', raw }
  }
  if (RANGE_RE.test(normalized)) {
    return { value: null, operator: 'range', raw }
  }
  if (PLAIN_NUMBER_RE.test(normalized)) {
    return { value: parseFloat(normalized), operator: '=', raw }
  }
  return { value: null, operator: 'unparseable', raw }
}
