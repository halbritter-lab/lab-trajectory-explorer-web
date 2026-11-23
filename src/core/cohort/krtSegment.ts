/**
 * The separate segment after kidney replacement therapy (owner decision
 * `censor` of 2026-11-22). Fits of native kidney function never run across
 * a kidney transplant or the start of chronic dialysis. A column that
 * includes those values (its censoring option for the first KRT event is
 * off) fits them as a segment of their own; the column's slope, flags,
 * endpoints and exports of the slope stay those of the values before it.
 */
import type { ClinicalEvent } from '../events/events'
import type { FitModel, TimeBalancing } from '../fitPipeline/types'
import { fitGlobal, fitTheilSen, type SeriesPoint } from '../stats/series'
import { balanceSeriesPoints } from '../stats/timeBalancing'
import { distinctDateCount } from '../stats/time'
import type { LinePoint } from '../stats/slopeLines'
import type { AnchorSide } from './anchorComparison'

/** Reason code of the values after the first KRT event that a column fits as
 * this separate segment; they are not part of the column's own fit. */
export const KRT_SEGMENT_REASON = 'krt_segment'

const MS_PER_DAY = 86_400_000
const MS_PER_YEAR = 365.25 * MS_PER_DAY

export interface KrtSegment {
  /** The first KRT event of the patient, where the segment starts (inclusive). */
  event: ClinicalEvent
  /** The segment's fit, with the column's estimator and time balancing.
   * Same fields as a side of the before/after comparison. */
  fit: AnchorSide
  /** The drawn line over the segment's fitted span; null without a slope. */
  line: LinePoint[] | null
}

/**
 * The segment of one cell. `points` are the cell's points; `segmentIdx` the
 * indices of the exact points whose only exclusion reason is the segment
 * window. Null when there is no segment event or the column has no fit.
 */
export function fitKrtSegment(input: {
  event: ClinicalEvent | null
  points: readonly SeriesPoint[]
  segmentIdx: readonly number[]
  fitModel: FitModel
  timeBalancing: TimeBalancing
}): KrtSegment | null {
  const { event, points, segmentIdx, fitModel, timeBalancing } = input
  if (event === null || fitModel === 'none') return null
  const fitted = balanceSeriesPoints(segmentIdx.map(index => points[index]), timeBalancing)
  const fit = fitModel === 'theil-sen' ? fitTheilSen(fitted) : fitGlobal(fitted)
  const first = fitted[0]?.date ?? null
  const last = fitted.at(-1)?.date ?? null
  const hasSlope = fit.reason === null && Number.isFinite(fit.slope)
  const line = hasSlope && first && last
    ? [{ date: first, value: fit.intercept }, { date: last, value: fit.intercept + fit.slope * ((last.getTime() - first.getTime()) / MS_PER_YEAR) }]
    : null
  return {
    event,
    fit: {
      nFitted: fitted.length,
      nFittedDates: distinctDateCount(fitted),
      fittedSpanDays: first && last && fitted.length > 1 ? Math.trunc((last.getTime() - first.getTime()) / MS_PER_DAY) : 0,
      firstDate: first,
      lastDate: last,
      slope: hasSlope ? fit.slope : Number.NaN,
      ciLow: hasSlope ? fit.ciLow : Number.NaN,
      ciHigh: hasSlope ? fit.ciHigh : Number.NaN,
      slopeSe: hasSlope ? fit.slopeSe ?? Number.NaN : Number.NaN,
    },
    line,
  }
}
