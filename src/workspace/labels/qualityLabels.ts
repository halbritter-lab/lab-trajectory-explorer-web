import type { CkdEndpoints } from '../../core/domains/nephrology/endpoints/ckdEndpoints'
import { isUnstableSlope, type SlopeQualityInput } from '../../core/stats/slopeQuality'
import { CKD_G5_EGFR_THRESHOLD, KDIGO_PROJECTION_MIN_DATES, KDIGO_PROJECTION_MIN_MONTHS } from '../../core/domains/nephrology/constants'
import { boundedShareWarns, type BoundedValuePolicy } from '../../core/measurements/censored'
import type { FitModel, TimeBalancing } from '../../core/fitPipeline/types'
import { msg, t, tx } from '../../i18n'

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
      title: t('No parseable numeric measurements in this series, so no slope was fitted.'),
      caveat: false,
    }
  }
  if (nFitted === 0) {
    return {
      label: 'no fit values',
      title: t('No usable measurements remain for fitting after exclusions and censoring.'),
      caveat: false,
    }
  }
  if (reason === 'n_below_threshold') {
    return {
      label: 'n < 3',
      title: t('Fewer than three usable measurements, so no slope was fitted.'),
      caveat: false,
    }
  }
  // All fitted points on one calendar day: there is no slope, so this must not
  // read as a fitted but uncertain one (decided 2026-10-07).
  if (input.fittedSpanDays === 0) {
    return {
      label: 'one date',
      title: t('All measurements used for the fit share one date, so no slope exists.'),
      caveat: false,
    }
  }
  if (input.nFittedDates < 3 && nFitted >= 3) {
    return {
      label: '< 3 dates',
      title: t('A slope was fitted from {n} measurements on only {dates} dates. Repeated measurements on one day add no information about the trend over time — interpret with caution.', { n: nFitted, dates: input.nFittedDates }),
      caveat: true,
    }
  }
  if (nFitted < 3) {
    return {
      label: 'n < 3',
      title: nFitted === 1
        ? t('A slope was fitted from only {n} point. Two points always define a line exactly (R² = 1), so the fit statistics say nothing about how well the trend is supported — interpret with caution.', { n: nFitted })
        : t('A slope was fitted from only {n} points. Two points always define a line exactly (R² = 1), so the fit statistics say nothing about how well the trend is supported — interpret with caution.', { n: nFitted }),
      caveat: true,
    }
  }
  return {
    label: '< 1 yr',
    title: t('A slope was fitted, but the measurements span less than one year. Slopes over such a short window are unstable — interpret with caution.'),
    caveat: true,
  }
}

/** Why Theil–Sen bounds on few dates are not a 95 % interval. Shared by the
 * withheld-projection tooltip, the slope cell and the export note. It holds
 * for one measurement per date only; with several per date the bounds are
 * rank-based and their coverage is not established. */
export const theilSenFewDatesCoverage = () =>
  t('With one measurement on each of three or four dates, the Theil–Sen bounds are the full range of pairwise slopes and cover the true slope only about 67 % or 92 % of the time')

/** The compact chips of `slopeQualityLabel` and `projectedG5Label` as shown;
 * the labels themselves are compared as codes and stay English. */
const CHIPS: Record<string, string> = {
  'no values': msg('no values'), 'no fit values': msg('no fit values'), 'n < 3': msg('n < 3'), 'one date': msg('one date'), '< 3 dates': msg('< 3 dates'), '< 1 yr': msg('< 1 yr'),
  'G5 not projected': msg('G5 not projected'), 'G5 not projected after KRT': msg('G5 not projected after KRT'), 'G5 no fit': msg('G5 no fit'), 'G5 now': msg('G5 now'),
  'G5 no age': msg('G5 no age'), 'G5 < 3 dates': msg('G5 < 3 dates'), 'G5 < 5 dates': msg('G5 < 5 dates'), 'G5 < 1 yr': msg('G5 < 1 yr'), 'G5 < 4 dates/3 yrs': msg('G5 < 4 dates/3 yrs'),
}
export const qualityLabelText = (label: string): string => CHIPS[label] ? tx(CHIPS[label]) : label

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
  // The series itself may have many dates over years when AKI windows removed
  // rows from the projection; the title then names the exclusion. Only then:
  // a column that excludes AKI windows by rule but lost no row here must not
  // suggest that AKI caused the gap.
  const aki = endpoints.inputExcludesAkiWindows && endpoints.projectionPointCount < endpoints.endpointPointCount
  const akiLead = `${t('Measurements inside AKI exclusion windows are left out of the projection.')} `
  switch (endpoints.projectedAgeToCkdG5.reason) {
    case 'observed_ckd_g5':
      return endpoints.evaluated.observedCkdG5 ? null : {
        label: 'G5 not projected',
        title: t('The eligible measurements contain a confirmed CKD G5 event (minimum {days} days), so no future age at CKD G5 is projected. Switch on Observed CKD G5 to see its dates.', { days: endpoints.confirmationDays }),
        caveat,
      }
    case 'kidney_failure_reached':
      return {
        label: 'G5 not projected after KRT',
        title: t('Kidney failure was reached at kidney replacement therapy, so no future individual G5 crossing is projected.'),
        caveat,
      }
    case 'no_fit':
      return {
        label: 'G5 no fit',
        title: t('No slope was fitted for this parameter (Trend is switched off, the method is No fit, or the fit failed), so no age at CKD G5 can be projected.'),
        caveat,
      }
    case 'non_declining_fit':
      return {
        label: 'G5 not projected',
        title: t('The endpoint fit is flat or rising, so no future age at CKD G5 was computed.'),
        caveat,
      }
    case 'slope_ci_includes_zero':
      return { label: 'G5 not projected', title: t('The endpoint fit slope confidence interval includes zero, so no future age at CKD G5 was computed.'), caveat }
    case 'slope_ci_unavailable':
      return { label: 'G5 not projected', title: t('Endpoint fit slope confidence bounds are unavailable, so no future age at CKD G5 was computed.'), caveat }
    case 'beyond_projection_horizon':
      return {
        label: 'G5 not projected',
        title: aki
          ? `${akiLead}${t('The fitted crossing is more than 20 years after the latest measurement used, so no future age at CKD G5 was reported.')}`
          : t('The fitted crossing is more than 20 years after the latest eligible eGFR measurement, so no future age at CKD G5 was reported.'),
        caveat,
      }
    case 'already_below_threshold':
      return {
        label: 'G5 now',
        title:
          (aki ? akiLead : '') + (aki
            ? t('The fitted curve reaches {threshold} at or before the latest measurement used, so there is no future crossing to project. This does not establish an observed event.', { threshold: CKD_G5_EGFR_THRESHOLD })
            : t('The fitted curve reaches {threshold} at or before the latest measurement, so there is no future crossing to project. This does not establish an observed event.', { threshold: CKD_G5_EGFR_THRESHOLD })),
        caveat,
      }
    case 'missing_age':
      return {
        label: 'G5 no age',
        title: t('No age recorded for the latest measurement, so the projection has no age anchor.'),
        caveat,
      }
    case 'insufficient_points':
      return {
        label: 'G5 < 3 dates',
        title: aki
          ? `${akiLead}${t('The measurements used fall on fewer than three distinct dates, so no projection was made.')}`
          : t('Usable measurements on fewer than three distinct dates, so no projection was made.'),
        caveat,
      }
    case 'theil_sen_insufficient_points':
      return {
        label: 'G5 < 5 dates',
        title:
          (aki ? akiLead : '') +
          t('Theil–Sen projections need usable measurements on at least five distinct dates. {coverage}, so no projection was made.', { coverage: theilSenFewDatesCoverage() }),
        caveat,
      }
    case 'span_too_short':
      return {
        label: 'G5 < 1 yr',
        title: aki
          ? `${akiLead}${t('The measurements used span less than one year, so no projection was made.')}`
          : t('Less than one year between first and last measurement, so no projection was made.'),
        caveat,
      }
    case 'kdigo_minimum_follow_up':
      return {
        label: 'G5 < 4 dates/3 yrs',
        title:
          (aki ? akiLead : '') +
          t('The extrapolation needs measurements on at least {dates} distinct dates over at least {years} years (KDIGO 2012: extrapolating the previous rate of change requires about four measurements over three years), so no extrapolation was made.', { dates: KDIGO_PROJECTION_MIN_DATES, years: KDIGO_PROJECTION_MIN_MONTHS / 12 }),
        caveat,
      }
    // 'disabled' and 'observed_ckd_g5' are not failures: the endpoint is off, or
    // G5 already happened and the observed date is shown instead.
    default:
      return null
  }
}

/**
 * The warning of a fit in which bounded values (`<x`, `>x`) make up 20 % or
 * more of the fitted points (owner decision 2026-11-21, issue #73), or null.
 * Substituting a limit biases slopes at high censoring fractions (Hornung and
 * Reed 1990; Hughes 1999), so the share is named, not hidden.
 */
export function boundedShareLabel(input: { nBounded: number; nFitted: number; boundedValues: BoundedValuePolicy; timeBalancing?: TimeBalancing; fitModel: FitModel }): QualityLabel | null {
  if (input.fitModel === 'none' || !boundedShareWarns(input.nBounded, input.nFitted)) return null
  const percent = Math.round((input.nBounded / input.nFitted) * 100)
  const entered = input.boundedValues === 'half-limit' ? t('<x at half its limit (x/2) and >x at its limit') : t('at their limit x')
  const counts = { n: input.nBounded, total: input.nFitted }
  const points = input.timeBalancing === 'monthly-median'
    ? t('{n} of {total} fitted monthly medians come from a month that holds a bounded value (<x, >x)', counts)
    : input.timeBalancing && input.timeBalancing !== 'raw'
      ? t('{n} of {total} fitted quarterly medians come from a quarter that holds a bounded value (<x, >x)', counts)
      : t('{n} of {total} fitted points are bounded values (<x, >x)', counts)
  return {
    label: t('{percent} % bounded', { percent }),
    title: t('{points}; bounds enter {entered}. The true values lie beyond the limits, so with 20 % or more bounded points the slope can be biased. Compare with "Exclude" under Calculation settings before relying on it.', { points, entered }),
    caveat: true,
  }
}
