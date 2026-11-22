import { cellSlopeTier, type CohortCell } from '../../core/cohort/screening'
import { RELIABLE_SLOPE_MIN_DATES } from '../../core/stats/slopeQuality'
import { formatDisplayDate as formatWorkspaceDate } from '../../core/format'

export interface SlopeTierNote {
  tier: 'estimable' | 'reliable'
  /** Text of the compact badge in the table. */
  short: string
  label: string
  title: string
}

const RULE = `Reliable: at least ${RELIABLE_SLOPE_MIN_DATES} fitted measurement dates over at least 2 years of fitted follow-up; estimable: at least 3 dates over at least 1 year. Counted are the fitted points (after exclusions and time balancing), not all measurements.`

/** The tier of a slope that meets the reliability rule (decision `minfu`,
 * 2026-11-22). Uncertain slopes keep their amber note; null for them and
 * without a slope. */
export function slopeTierNote(cell: CohortCell): SlopeTierNote | null {
  const tier = cellSlopeTier(cell)
  if (tier === 'reliable') {
    return { tier, short: 'reliable', label: 'Reliable slope', title: `${cell.nFittedDates} fitted dates over ${cell.fittedSpanDays} days. ${RULE}` }
  }
  if (tier === 'estimable') {
    const missing = [
      cell.nFittedDates < RELIABLE_SLOPE_MIN_DATES ? `${cell.nFittedDates} fitted dates` : null,
      cell.fittedSpanDays < 731 ? `${cell.fittedSpanDays} days of fitted follow-up` : null,
    ].filter(Boolean).join(' and ')
    return { tier, short: 'estimable', label: 'Estimable slope', title: `Not yet reliable: ${missing}. ${RULE}` }
  }
  return null
}

/** The sentence on the separate segment after kidney replacement therapy, or
 * null when the cell has none. */
export function krtSegmentText(cell: CohortCell, slopeNumber: (value: number, signed?: boolean) => string): string | null {
  const segment = cell.krtSegment
  if (!segment) return null
  const event = segment.event.type === 'kidney_transplant' ? 'kidney transplant' : 'chronic dialysis start'
  const { fit } = segment
  const slope = Number.isFinite(fit.slope)
    ? `${slopeNumber(fit.slope, true)} ${cell.einheit ?? ''}/year`
    : 'no slope'
  const interval = Number.isFinite(fit.ciLow) && Number.isFinite(fit.ciHigh) ? `, bounds [${slopeNumber(fit.ciLow)}, ${slopeNumber(fit.ciHigh)}]` : ''
  return `After ${event} (${formatWorkspaceDate(segment.event.date)}), fitted as a separate segment: ${slope} (${fit.nFitted} fitted, ${fit.nFittedDates} ${fit.nFittedDates === 1 ? 'date' : 'dates'}, over ${fit.fittedSpanDays} days${interval}). Not native kidney function; the slope above uses the values before it.`
}
