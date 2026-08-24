import type { FitConfig } from '../fitPipeline/types'
import type { SeriesSummary } from './summarize'

/** The reason codes the core produces. Imported rather than re-declared so a
 * renamed code breaks the build instead of silently blanking every badge. */
export type SlopeReason = SeriesSummary['reason']

export interface SlopeQualityInput {
  reason: SlopeReason
  /** Points the fit consumed, after censoring, AKI exclusion and balancing. */
  nFitted: number
  /** Whole days between the first and last points consumed by the scalar fit. */
  fittedSpanDays: number
  /** 'none' means no fit was requested, so there is no slope to qualify. */
  fitModel: FitConfig['fitModel']
}

/**
 * Whether a fitted slope is stable enough to act on.
 *
 * This is the app's own reliability rule and deliberately not the same as
 * `reason`. Reason codes mirror the Python reference implementation, where a
 * two-point series is not a failure: fitGlobal (see ./series.ts) special-cases
 * n === 2, returns the exact two-point slope with r2 = 1 and reason null. Over
 * a span longer than a year that leaves the row unflagged while an R² of 1
 * suggests the opposite. Checking the point count alongside reason catches it
 * without changing any numeric output, so parity is preserved.
 *
 * Counts nFitted, not nNumeric: quarterly-median balancing — the default in the
 * CKD-progression preset — can collapse eight raw measurements into two fitted
 * points, which is exactly the case this rule exists to catch.
 *
 * Thresholds follow a common clinical rule of thumb: fewer than three fitted
 * measurements, or under a year between the first and last fitted points.
 */
export function isUnstableSlope({ reason, nFitted, fittedSpanDays, fitModel }: SlopeQualityInput): boolean {
  // No fit requested (the "Acute review" preset): there is no slope to caveat.
  // summarize reports reason 'n_below_threshold' for this case regardless of how
  // many points exist, so reading reason alone would claim "fewer than three
  // measurements" for a series with dozens.
  if (fitModel === 'none') return false
  if (reason === 'no_numeric_values' || reason === 'n_below_threshold') return true
  if (nFitted < 3) return true
  if (fittedSpanDays < 365) return true
  return reason === 'span_too_short'
}
