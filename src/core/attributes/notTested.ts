/**
 * Attribute values that mean "not tested" (decision `genomiss` of 2026-11-22,
 * issue #4; Groenwold RHH et al., CMAJ 2012;184:1265, PMID 22371511).
 *
 * The imported value is kept verbatim on import and everywhere else; cohort
 * model factors read a value from this vocabulary as the level
 * `NOT_TESTED_LEVEL`, which is never merged with "no variant" and never with
 * a blank cell (blank stays missing). The vocabulary is deliberately short:
 * a value is recognised only when, trimmed, lower-cased and with inner
 * whitespace collapsed to one space, it equals one of these texts.
 */
export const NOT_TESTED_VOCABULARY = ['not tested', 'nicht getestet', 'n.t.', 'nt'] as const

/** The level a "not tested" value enters a cohort model factor as. */
export const NOT_TESTED_LEVEL = 'not tested'

export function isNotTestedValue(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  return (NOT_TESTED_VOCABULARY as readonly string[]).includes(normalized)
}
