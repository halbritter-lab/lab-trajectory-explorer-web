import type { LabRow } from '../types'

/** A bound is retained for display but supplies no exact observed value. */
export const CENSORED_VALUE_REASON = 'censored-value'

export function isExactMeasurement(row: Pick<LabRow, 'wertOperator'>): boolean {
  return row.wertOperator === '='
}

/**
 * How bounded values (`<x`, `>x`) enter a column's individual fits and slope
 * lines (owner decision 2026-11-21, issue #73): `limit` enters both at x (the
 * default), `half-limit` enters `<x` at x/2 and `>x` at x, `exclude` leaves
 * both out (the rule of 2026-10-06). Endpoints and projection, AKI detection
 * and cohort mixed models exclude bounds whatever this says (decided
 * 2026-11-22). See docs/method-algorithms/bounded-measurements.md.
 */
export type BoundedValuePolicy = 'limit' | 'exclude' | 'half-limit'

export const DEFAULT_BOUNDED_VALUE_POLICY: BoundedValuePolicy = 'limit'

/** A `<x` or `>x` row. Rows with another non-exact operator (`range`,
 * `unparseable`) that still carry a number are not bounds and enter no fit. */
export function isBoundedMeasurement(row: Pick<LabRow, 'wertOperator'>): row is { wertOperator: '<' | '>' } {
  return row.wertOperator === '<' || row.wertOperator === '>'
}

/** The value a dated numeric row enters an individual fit with, or null when
 * it does not enter: an exact row with its value, a bound by the policy. */
export function fitValueOf(row: Pick<LabRow, 'wertOperator' | 'wertNum'>, policy: BoundedValuePolicy = DEFAULT_BOUNDED_VALUE_POLICY): number | null {
  if (row.wertNum === null) return null
  if (isExactMeasurement(row)) return row.wertNum
  if (policy === 'exclude' || !isBoundedMeasurement(row)) return null
  return policy === 'half-limit' && row.wertOperator === '<' ? row.wertNum / 2 : row.wertNum
}

/** Whether `nBounded` of `nFitted` fitted points reach the warning share of
 * 20 % or more (owner decision 2026-11-21). Compared in integers, so 1 of 5
 * and 3 of 15 warn without binary rounding. */
export function boundedShareWarns(nBounded: number, nFitted: number): boolean {
  return nFitted > 0 && nBounded > 0 && nBounded * 5 >= nFitted
}
