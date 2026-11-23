import type { FitModel } from '../fitPipeline/types'
import type { SeriesSummary } from './summarize'

/** The reason codes the core produces. Imported rather than re-declared so a
 * renamed code breaks the build instead of silently blanking every badge. */
export type SlopeReason = SeriesSummary['reason']

export interface SlopeQualityInput {
  reason: SlopeReason
  /** Points the fit consumed, after censoring, AKI exclusion and balancing. */
  nFitted: number
  /** Distinct calendar dates among those points; the count the rule checks. */
  nFittedDates: number
  /** Whole days between the first and last points consumed by the scalar fit. */
  fittedSpanDays: number
  /** 'none' means no fit was requested, so there is no slope to qualify. */
  fitModel: FitModel
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
 * Counts the fitted points' dates, not nNumeric: quarterly-median balancing — the default in the
 * CKD-progression preset — can collapse eight raw measurements into two fitted
 * points, which is exactly the case this rule exists to catch.
 *
 * Thresholds follow a common clinical rule of thumb: fewer than three fitted
 * measurement dates, or under a year between the first and last fitted points.
 * Dates rather than points (decided 2026-11-05): three same-day rows and one
 * value a year later are two observations in time, not four.
 */
export function isUnstableSlope({ reason, nFitted, nFittedDates, fittedSpanDays, fitModel }: SlopeQualityInput): boolean {
  // No fit requested (the "Acute review" preset): there is no slope to caveat.
  // summarize reports reason 'n_below_threshold' for this case regardless of how
  // many points exist, so reading reason alone would claim "fewer than three
  // measurements" for a series with dozens.
  if (fitModel === 'none') return false
  if (reason === 'no_numeric_values' || reason === 'n_below_threshold') return true
  // Dates never exceed points, so the point count changes no typed call; it
  // guards untyped callers that still pass the shape without nFittedDates.
  if (nFitted < 3 || nFittedDates < 3) return true
  if (fittedSpanDays < 365) return true
  return reason === 'span_too_short'
}

/** Distinct fitted dates a "reliable" slope needs (decision `minfu`, 2026-11-22). */
export const RELIABLE_SLOPE_MIN_DATES = 4
/** Fitted span a "reliable" slope needs: two years of 365.25 days. Spans are
 * whole days, so this means at least 731 days. */
export const RELIABLE_SLOPE_MIN_SPAN_DAYS = 2 * 365.25

/** The tier of a slope (decision `minfu`, 2026-11-22). `uncertain`: the
 * reliability rule above is met (`unstable_slope = yes`); `estimable`: it is
 * not; `reliable`: in addition at least four distinct fitted dates over at
 * least two years of fitted span. */
export type SlopeTier = 'uncertain' | 'estimable' | 'reliable'

/**
 * The tier of a fitted slope, or null when there is no slope to qualify (fit
 * model `none`, or no finite slope). Counts fitted dates and the fitted span,
 * never `nNumeric`. A layer over `isUnstableSlope`, which stays the gate of
 * the rapid-decline flag and the source of `unstable_slope`.
 */
export function slopeTier(input: SlopeQualityInput & { slope: number }): SlopeTier | null {
  if (input.fitModel === 'none' || !Number.isFinite(input.slope)) return null
  if (isUnstableSlope(input)) return 'uncertain'
  return input.nFittedDates >= RELIABLE_SLOPE_MIN_DATES && input.fittedSpanDays >= RELIABLE_SLOPE_MIN_SPAN_DAYS ? 'reliable' : 'estimable'
}
