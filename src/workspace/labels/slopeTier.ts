import { cellSlopeTier, type CohortCell } from '../../core/cohort/screening'
import { RELIABLE_SLOPE_MIN_DATES, RELIABLE_SLOPE_MIN_SPAN_DAYS } from '../../core/stats/slopeQuality'
import { formatDisplayDate as formatWorkspaceDate } from '../../core/format'
import { t } from '../../i18n'
import { countLabel } from '../workspace-labels'

export interface SlopeTierNote {
  tier: 'estimable' | 'reliable'
  /** Text of the compact badge in the table. */
  short: string
  label: string
  title: string
}

const rule = () => t('Reliable: at least {dates} fitted measurement dates over at least 2 years of fitted follow-up; estimable: at least 3 dates over at least 1 year. Counted are the fitted points (after exclusions and time balancing), not all measurements.', { dates: RELIABLE_SLOPE_MIN_DATES })

/** The tier of a slope that meets the reliability rule (decision `minfu`,
 * 2026-11-22). Uncertain slopes keep their amber note; null for them and
 * without a slope. */
export function slopeTierNote(cell: CohortCell): SlopeTierNote | null {
  const tier = cellSlopeTier(cell)
  if (tier === 'reliable') {
    return { tier, short: t('reliable'), label: t('Reliable slope'), title: `${t('{dates} fitted dates over {days} days.', { dates: cell.nFittedDates, days: cell.fittedSpanDays })} ${rule()}` }
  }
  if (tier === 'estimable') {
    const missing = [
      cell.nFittedDates < RELIABLE_SLOPE_MIN_DATES ? t('{n} fitted dates', { n: cell.nFittedDates }) : null,
      cell.fittedSpanDays < RELIABLE_SLOPE_MIN_SPAN_DAYS ? t('{n} days of fitted follow-up', { n: cell.fittedSpanDays }) : null,
    ].filter(Boolean).join(` ${t('and')} `)
    return { tier, short: t('estimable'), label: t('Estimable slope'), title: `${t('Not yet reliable: {missing}.', { missing })} ${rule()}` }
  }
  return null
}

/** The sentence on the separate segment after kidney replacement therapy, or
 * null when the cell has none. */
export function krtSegmentText(cell: CohortCell, slopeNumber: (value: number, signed?: boolean) => string): string | null {
  const segment = cell.krtSegment
  if (!segment) return null
  const event = segment.event.type === 'kidney_transplant' ? t('kidney transplant') : t('chronic dialysis start')
  const { fit } = segment
  const slope = Number.isFinite(fit.slope)
    ? t('{slope} {unit}/year', { slope: slopeNumber(fit.slope, true), unit: cell.einheit ?? '' })
    : t('no slope')
  const interval = Number.isFinite(fit.ciLow) && Number.isFinite(fit.ciHigh) ? `, ${t('bounds [{low}, {high}]', { low: slopeNumber(fit.ciLow), high: slopeNumber(fit.ciHigh) })}` : ''
  return t('After {event} ({date}), fitted as a separate segment: {slope} ({n} fitted, {dates}, over {days} days{interval}). Not native kidney function; the slope above uses the values before it.', { event, date: formatWorkspaceDate(segment.event.date), slope, n: fit.nFitted, dates: countLabel(fit.nFittedDates, 'date'), days: fit.fittedSpanDays, interval })
}
