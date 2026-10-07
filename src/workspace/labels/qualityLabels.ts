import type { CkdEndpoints } from '../../core/domains/nephrology/endpoints/ckdEndpoints'
import { isUnstableSlope, type SlopeQualityInput } from '../../core/stats/slopeQuality'
import { CKD_G5_EGFR_THRESHOLD } from '../../core/domains/nephrology/constants'

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
  // All fitted points on one calendar day: there is no slope, so this must not
  // read as a fitted but uncertain one (decided 2026-10-07).
  if (input.fittedSpanDays === 0) {
    return {
      label: 'one date',
      title: 'All measurements used for the fit share one date, so no slope exists.',
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
 * exists, when the endpoint is off, or when G5 was observed and the observed
 * endpoint is on — the caller shows the observed date in that case. With the
 * observed endpoint off, a confirmed G5 still withholds the projection and is
 * named here, because nothing else would explain the empty cell.
 *
 * A missing scalar fit is represented explicitly as `no_fit`, so it cannot be
 * confused with a real non-declining fit.
 */
export function projectedG5Label(endpoints: CkdEndpoints): QualityLabel | null {
  if (endpoints.projectedAgeToCkdG5.value !== null) return null
  const caveat = false
  switch (endpoints.projectedAgeToCkdG5.reason) {
    case 'observed_ckd_g5':
      return endpoints.evaluated.observedCkdG5 ? null : {
        label: 'G5 not projected',
        title: `The eligible measurements contain a confirmed CKD G5 event (minimum ${endpoints.confirmationDays} days), so no future age at CKD G5 is projected. Switch on Observed CKD G5 to see its dates.`,
        caveat,
      }
    case 'kidney_failure_reached':
      return {
        label: 'G5 not projected after KRT',
        title: 'Kidney failure was reached at kidney replacement therapy, so no future individual G5 crossing is projected.',
        caveat,
      }
    case 'no_fit':
      return {
        label: 'G5 no fit',
        title: 'No fitted slope is available, so no age at CKD G5 can be projected.',
        caveat,
      }
    case 'non_declining_fit':
      return {
        label: 'G5 not projected',
        title:
          'The endpoint fit is flat or rising, so no future age at CKD G5 was computed.',
        caveat,
      }
    case 'slope_ci_includes_zero':
      return { label: 'G5 not projected', title: 'The endpoint fit slope confidence interval includes zero, so no future age at CKD G5 was computed.', caveat }
    case 'slope_ci_unavailable':
      return { label: 'G5 not projected', title: 'Endpoint fit slope confidence bounds are unavailable, so no future age at CKD G5 was computed.', caveat }
    case 'beyond_projection_horizon':
      return { label: 'G5 not projected', title: 'The fitted crossing is more than 20 years after the latest eligible eGFR measurement, so no future age at CKD G5 was reported.', caveat }
    case 'already_below_threshold':
      return {
        label: 'G5 now',
        title:
          `The fitted curve reaches ${CKD_G5_EGFR_THRESHOLD} at or before the latest measurement, ` +
          'so there is no future crossing to project. This does not establish an observed event.',
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
