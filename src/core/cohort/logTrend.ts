import type { LabRow } from '../types'
import type { LinePoint } from '../stats/slopeLines'
import type { SeriesSummary } from '../stats/summarize'

/**
 * Trend on log values for the logarithmic y axis of a column (issue #70,
 * owner decision 2026-11-21). An additional result of a cell: the column's own
 * slope, interval, reason, flags, endpoints and exports are not changed by it.
 *
 * The column's fit pipeline (mode, estimator, preset, censoring and exclusion
 * windows, time balancing) runs a second time on the natural logarithm of the
 * series values. Values of zero or less have no logarithm and are left out of
 * that second run as if they were absent; they are counted in `nNonPositive`.
 * See docs/method-algorithms/log-scale-and-doubling-time.md.
 */
export interface LogTrend {
  /** Slope of ln(value) per year (1/year). */
  slope: number
  /** Bounds of that slope, as the column's estimator gives them (95 % OLS
   * interval, or Theil-Sen bounds). */
  ciLow: number
  ciHigh: number
  slopeSe: number
  r2: number
  /** Fitted ln(value) at `firstFittedDate`. */
  intercept: number
  nFitted: number
  nFittedDates: number
  fittedSpanDays: number
  firstFittedDate: Date | null
  lastFittedDate: Date | null
  reason: SeriesSummary['reason']
  /** Dated numeric measurements of the series with a value of zero or less:
   * left out of the log fit and not drawn on the log axis. */
  nNonPositive: number
  /** ln 2 / slope in years: positive is a doubling time, negative a halving
   * time (its magnitude). NaN without a finite, non-zero slope. */
  doublingTimeYears: number
  /** Interval of `doublingTimeYears` from the slope bounds, as signed values
   * [ln 2 / ciHigh, ln 2 / ciLow]; NaN when a bound is not finite or the bounds
   * include zero (the interval is then unbounded). */
  doublingCiLow: number
  doublingCiHigh: number
  /** Fit lines of the log fit, back-transformed to the unit of the series
   * (exp of the fitted log values), so they are straight on a log axis. */
  fitLines: LinePoint[][]
}

/** The rows of a patient with the values of one series replaced by their
 * natural logarithm. A series value of zero or less becomes a row without a
 * numeric value, so the fit pipeline treats it as absent. Bounds (`<x`, `>x`)
 * keep their operator and stay out of every fit, as on the linear scale. */
export function logTransformedRows(rows: readonly LabRow[], isSeriesRow: (row: LabRow) => boolean): { rows: LabRow[]; nNonPositive: number } {
  let nNonPositive = 0
  const out = rows.map((row) => {
    if (!isSeriesRow(row) || row.wertNum === null) return row
    if (row.wertNum > 0) return { ...row, wertNum: Math.log(row.wertNum) }
    if (row.labDatum !== null) nNonPositive++
    return { ...row, wertNum: null }
  })
  return { rows: out, nNonPositive }
}

/** Doubling (positive) or halving (negative) time in years for a slope of
 * ln(value) per year, with the interval from the slope bounds. */
export function doublingTime(slope: number, ciLow: number, ciHigh: number): { years: number; ciLow: number; ciHigh: number } {
  const years = Number.isFinite(slope) && slope !== 0 ? Math.LN2 / slope : Number.NaN
  const bounded = Number.isFinite(years) && Number.isFinite(ciLow) && Number.isFinite(ciHigh) && (ciLow > 0 || ciHigh < 0)
  return { years, ciLow: bounded ? Math.LN2 / ciHigh : Number.NaN, ciHigh: bounded ? Math.LN2 / ciLow : Number.NaN }
}

/** Back-transform fit lines of log values to the unit of the series. */
export function expLines(lines: readonly LinePoint[][]): LinePoint[][] {
  return lines.map((line) => line.map((point) => ({ date: point.date, value: Math.exp(point.value) })))
}
