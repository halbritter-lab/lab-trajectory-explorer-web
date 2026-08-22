/**
 * Whether a fitted slope is stable enough to act on.
 *
 * This is the app's own reliability rule and is deliberately *not* the same as
 * the `reason` field. Reason codes mirror the Python reference implementation,
 * where a two-point series is not treated as a failure: fitGlobal (see
 * ./series.ts) special-cases n === 2, returns the exact two-point slope with
 * r2 = 1 and reason null. Over a span longer than a year that leaves such a row
 * with no flag at all, even though two points are precisely the case the rule
 * warns about — and an R² of 1 actively suggests the opposite.
 *
 * Checking nNumeric alongside reason catches that without changing any numeric
 * output, so parity with the Python core is preserved.
 *
 * The thresholds follow a common clinical rule of thumb: fewer than three
 * measurements, or under a year between the first and the last.
 */
export function isUnstableSlope(reason: string | null, nNumeric: number): boolean {
  if (reason === 'no_numeric_values' || reason === 'n_below_threshold') return true
  if (nNumeric < 3) return true
  return reason === 'span_too_short'
}
