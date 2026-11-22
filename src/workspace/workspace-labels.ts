import { exclusionReasonLabel as moduleExclusionReasonLabel } from '../core/analysis/registry'
import { CENSORED_VALUE_REASON } from '../core/measurements/censored'
import { ANCHOR_WINDOW_REASON } from '../core/cohort/anchorComparison'

/** Presentation only: stored sex codes and grouping identities remain unchanged. */
export function sexLabel(value?: string | null): string {
  if (!value) return 'Not recorded'
  return ({ w: 'Female', m: 'Male', d: 'Diverse' } as Record<string, string>)[value] ?? value
}

/** Readable reason a measurement is excluded from the fit, as the module that
 * excludes it names it. */
export function exclusionReasonLabel(reason: string): string {
  if (reason === CENSORED_VALUE_REASON) return 'censored value (limit, not exact)'
  if (reason === ANCHOR_WINDOW_REASON) return 'exclusion window after the anchor event, after-anchor slope only'
  return moduleExclusionReasonLabel(reason)
}

/** File name the bundled demo dataset is loaded under. */
export const DEMO_FILE_NAME = 'test_labs.xlsx (Demo)'

/** How a parameter (test name and unit) is shown everywhere. */
export function parameterLabel(bezeichnung: string, einheit: string | null): string {
  return `${bezeichnung} [${einheit ?? 'no unit'}]`
}

/** "1 row", "3 rows": English count with the matching noun form. */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** What one fitted point of a column is: a measurement, or under time
 * balancing the median of a calendar month or quarter. Counts of fitted
 * points must use this noun, or "8 fitted measurements" is said of eight
 * quarterly medians built from 24 measurements. */
export function fittedPointNoun(timeBalancing: 'raw' | 'monthly-median' | 'quarterly-median'): string {
  return timeBalancing === 'monthly-median' ? 'monthly median' : timeBalancing === 'quarterly-median' ? 'quarterly median' : 'fitted measurement'
}
