import type { CohortCell } from '../../core/cohort/screening'
import { MIN_THEIL_SEN_PROJECTION_DATES } from '../../core/endpoints/thresholdEndpoints'
import { isUnstableSlope } from '../../core/stats/slopeQuality'
import { countLabel } from '../workspace-labels'
import { t } from '../../i18n'

/** Three significant digits: a slope of ln(value) is often far below one. */
export const formatSignificant = (value: number): string => Number.isFinite(value) ? value.toLocaleString('en-GB', { maximumSignificantDigits: 3 }) : '—'

/**
 * Wording of the doubling or halving time of a cell on a logarithmic axis
 * (issue #70). `short` fits a table cell; `long` names the estimator, the
 * slope of ln(value), the interval and what was left out. Null when the cell
 * has no log trend; `short` is null when no time can be given.
 */
export function doublingTimeText(cell: Pick<CohortCell, 'logTrend' | 'fitModel' | 'mode'>): { short: string | null; long: string; uncertain: boolean } | null {
  const trend = cell.logTrend
  if (!trend) return null
  const nonPositive = trend.nNonPositive > 0 ? ` ${t('{values} of zero or less left out (no logarithm).', { values: countLabel(trend.nNonPositive, 'value') })}` : ''
  if (cell.fitModel === 'none') return { short: null, long: `${t('No doubling time: the fit model is disabled.')}${nonPositive}`, uncertain: false }
  const years = trend.doublingTimeYears
  if (!Number.isFinite(years)) {
    const why = trend.slope === 0 ? t('No doubling time: the slope of the log values is zero (no change).') : t('No doubling time: no slope of the log values could be fitted.')
    return { short: null, long: `${why}${nonPositive}`, uncertain: false }
  }
  const halving = years < 0
  const uncertain = isUnstableSlope({ reason: trend.reason, nFitted: trend.nFitted, nFittedDates: trend.nFittedDates, fittedSpanDays: trend.fittedSpanDays, fitModel: cell.fitModel })
  const range = cell.fitModel === 'theil-sen' && trend.nFittedDates < MIN_THEIL_SEN_PROJECTION_DATES
  const intervalName = range ? t('Theil–Sen bounds, not a 95% interval') : t('95% CI')
  const bounds = [Math.abs(trend.doublingCiLow), Math.abs(trend.doublingCiHigh)].sort((a, b) => a - b)
  const interval = Number.isFinite(trend.doublingCiLow) && Number.isFinite(trend.doublingCiHigh)
    ? ` ${t('({interval} {low} to {high} years)', { interval: intervalName, low: formatSignificant(bounds[0]), high: formatSignificant(bounds[1]) })}`
    : Number.isFinite(trend.ciLow) && Number.isFinite(trend.ciHigh) ? ` ${t('(the {interval} of the slope includes no change, so the time has no bound)', { interval: intervalName })}` : ''
  const estimator = cell.fitModel === 'theil-sen' ? 'Theil–Sen' : cell.mode === 'rolling' || cell.mode === 'gap-split' ? t('global OLS') : 'OLS'
  const time = formatSignificant(Math.abs(years))
  const details = { time, interval, estimator, slope: formatSignificant(trend.slope), points: countLabel(trend.nFitted, 'fitted point'), days: trend.fittedSpanDays }
  const long = (halving
    ? t('Halving time {time} years{interval}: ln 2 divided by the {estimator} slope of the natural logarithm of the values, {slope} per year, from {points} over {days} days.', details)
    : t('Doubling time {time} years{interval}: ln 2 divided by the {estimator} slope of the natural logarithm of the values, {slope} per year, from {points} over {days} days.', details))
    + `${uncertain ? ` ${t('Uncertain: fewer than three fitted dates or less than one year between the first and the last.')}` : ''}${nonPositive}`
  return { short: halving ? t('halves in {time} y', { time }) : t('doubles in {time} y', { time }), long, uncertain }
}
