import type { CkdEndpoints } from '../core/endpoints/ckdEndpoints'

/**
 * User-facing wording for the quality and endpoint reason codes the core
 * produces. Kept in one place because the same codes surface in the cohort
 * table, the patient detail plot and (see issue #2) the cohort overlay, and
 * they must read identically in all three.
 *
 * `label` is a compact chip; `title` is the tooltip and carries the detail.
 */
export interface QualityLabel {
  label: string
  title: string
}

/** Reason codes from summarizeByBezeichnung / fitOls (see src/core/stats). */
export type SlopeReason = 'no_numeric_values' | 'n_below_threshold' | 'span_too_short' | string

/**
 * A slope's reliability caveat, or null when there is nothing to flag.
 *
 * Two cut-offs, following a common clinical rule of thumb: fewer than three
 * measurements, or less than a year between the first and the last, and the
 * slope is not worth acting on.
 *
 * `nNumeric` is checked separately from `reason` on purpose. The core's reason
 * codes mirror the Python reference implementation, and there a two-point series
 * is *not* a failure: fitGlobal (src/core/stats/series.ts) special-cases n === 2,
 * returns the exact two-point slope with r2 = 1 and reason null. Over a span
 * longer than a year that leaves the row completely unflagged, even though two
 * points are exactly the case the rule warns about. Deriving the badge from
 * nNumeric as well catches it without touching the parity-locked numerics.
 */
export function slopeQualityLabel(reason: SlopeReason | null, nNumeric?: number): QualityLabel | null {
  if (reason === 'no_numeric_values' || nNumeric === 0) {
    return {
      label: 'no values',
      title: 'No parseable numeric measurements in this series, so no slope was fitted.',
    }
  }
  if (reason === 'n_below_threshold') {
    return {
      label: 'n < 3',
      title: 'Fewer than three usable measurements, so no slope was fitted.',
    }
  }
  if (nNumeric !== undefined && nNumeric < 3) {
    return {
      label: 'n < 3',
      title:
        `A slope was fitted from only ${nNumeric} measurements. Two points always define a ` +
        'line exactly (R² = 1), so the fit statistics say nothing about how well the trend ' +
        'is supported — interpret with caution.',
    }
  }
  if (reason === 'span_too_short') {
    return {
      label: '< 1 yr',
      title:
        'A slope was fitted, but the measurements span less than one year. ' +
        'Slopes over such a short window are unstable — interpret with caution.',
    }
  }
  return null
}

/** True when the slope exists but carries a caveat, as opposed to not existing
 * at all. Lets callers style "unreliable" differently from "not computed". */
export function isSlopeCaveat(reason: SlopeReason | null, nNumeric?: number): boolean {
  if (reason === 'no_numeric_values' || reason === 'n_below_threshold') return false
  if (nNumeric !== undefined && nNumeric > 0 && nNumeric < 3) return true
  return reason === 'span_too_short'
}

export { isUnstableSlope } from '../core/stats/slopeQuality'

/**
 * Why no projected age to CKD G5 was produced. Returns null when a projection
 * exists, when the endpoint is switched off, or when G5 was already observed —
 * the caller shows the observed date in that case.
 *
 * Before this existed the badge simply rendered nothing, which read as "not
 * applicable" whether the patient was stable or the data was too thin.
 */
export function projectedG5Label(endpoints: CkdEndpoints): QualityLabel | null {
  if (endpoints.projectedAgeToCkdG5.value !== null) return null
  switch (endpoints.projectedAgeToCkdG5.reason) {
    case 'non_declining_fit':
      return {
        label: 'G5 unlikely',
        title:
          'eGFR is not declining over the fitted window, so no age at CKD G5 is projected. ' +
          'This is a statement about the observed trend, not a prognosis.',
      }
    case 'already_below_threshold':
      return {
        label: 'G5 now',
        title:
          'The latest eGFR is already below 15, but without a confirmed persistent period, ' +
          'so neither observed CKD G5 nor a projection applies.',
      }
    case 'missing_age':
      return {
        label: 'G5 no age',
        title: 'No age recorded for the latest measurement, so the projection has no age anchor.',
      }
    case 'insufficient_points':
      return {
        label: 'G5 n < 3',
        title: 'Fewer than three usable measurements, so no projection was made.',
      }
    case 'span_too_short':
      return {
        label: 'G5 < 1 yr',
        title: 'Less than one year between first and last measurement, so no projection was made.',
      }
    // 'disabled' and 'observed_ckd_g5' are not failures: the endpoint is off, or
    // G5 already happened and the observed date is shown instead.
    default:
      return null
  }
}
