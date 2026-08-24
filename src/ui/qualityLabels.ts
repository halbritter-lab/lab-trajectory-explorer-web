import type { CkdEndpoints } from '../core/endpoints/ckdEndpoints'
import { isUnstableSlope, type SlopeQualityInput } from '../core/stats/slopeQuality'

export { isUnstableSlope }
export type { SlopeQualityInput }

/**
 * User-facing wording for the quality and endpoint reason codes the core
 * produces. Kept in one place because the same codes surface in the cohort
 * table, the patient detail plot and (see issue #2) the cohort overlay, and
 * they must read identically in all three.
 *
 * `label` is a compact chip, `title` the tooltip detail, and `caveat` says
 * whether a slope exists but is unreliable (amber) as opposed to not existing
 * at all (grey) — returned here so callers classify once rather than
 * re-deriving it alongside every label lookup.
 */
export interface QualityLabel {
  label: string
  title: string
  caveat: boolean
}

/**
 * A slope's reliability caveat, or null when there is nothing to flag.
 * Shares its rule with isUnstableSlope, so the badge and the unstable_slope
 * export column can never disagree.
 */
export function slopeQualityLabel(input: SlopeQualityInput): QualityLabel | null {
  if (!isUnstableSlope(input)) return null
  const { reason, nFitted } = input

  if (reason === 'no_numeric_values') {
    return {
      label: 'no values',
      title: 'No parseable numeric measurements in this series, so no slope was fitted.',
      caveat: false,
    }
  }
  if (nFitted === 0) {
    return {
      label: 'no fit values',
      title: 'No usable measurements remain for fitting after exclusions and censoring.',
      caveat: false,
    }
  }
  if (reason === 'n_below_threshold') {
    return {
      label: 'n < 3',
      title: 'Fewer than three usable measurements, so no slope was fitted.',
      caveat: false,
    }
  }
  if (nFitted < 3) {
    return {
      label: 'n < 3',
      title:
        `A slope was fitted from only ${nFitted} point${nFitted === 1 ? '' : 's'}. Two points ` +
        'always define a line exactly (R² = 1), so the fit statistics say nothing about how ' +
        'well the trend is supported — interpret with caution.',
      caveat: true,
    }
  }
  return {
    label: '< 1 yr',
    title:
      'A slope was fitted, but the measurements span less than one year. ' +
      'Slopes over such a short window are unstable — interpret with caution.',
    caveat: true,
  }
}

/**
 * Why no projected age to CKD G5 was produced. Returns null when a projection
 * exists, when the endpoint is off, or when G5 was already observed — the
 * caller shows the observed date in that case.
 *
 * A missing scalar fit is represented explicitly as `no_fit`, so it cannot be
 * confused with a real non-declining fit.
 */
export function projectedG5Label(endpoints: CkdEndpoints): QualityLabel | null {
  if (endpoints.projectedAgeToCkdG5.value !== null) return null
  const caveat = false
  switch (endpoints.projectedAgeToCkdG5.reason) {
    case 'no_fit':
      return {
        label: 'G5 no fit',
        title: 'No fitted slope is available, so no age at CKD G5 can be projected.',
        caveat,
      }
    case 'non_declining_fit':
      return {
        label: 'G5 unlikely',
        title:
          'eGFR is not declining over the fitted window, so no age at CKD G5 is projected. ' +
          'This is a statement about the observed trend, not a prognosis.',
        caveat,
      }
    case 'already_below_threshold':
      return {
        label: 'G5 now',
        title:
          'The latest eGFR is already below 15, but without a confirmed persistent period, ' +
          'so neither observed CKD G5 nor a projection applies.',
        caveat,
      }
    case 'missing_age':
      return {
        label: 'G5 no age',
        title: 'No age recorded for the latest measurement, so the projection has no age anchor.',
        caveat,
      }
    case 'insufficient_points':
      return {
        label: 'G5 n < 3',
        title: 'Fewer than three usable measurements, so no projection was made.',
        caveat,
      }
    case 'span_too_short':
      return {
        label: 'G5 < 1 yr',
        title: 'Less than one year between first and last measurement, so no projection was made.',
        caveat,
      }
    // 'disabled' and 'observed_ckd_g5' are not failures: the endpoint is off, or
    // G5 already happened and the observed date is shown instead.
    default:
      return null
  }
}
