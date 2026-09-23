import type { OlsFit } from '../types'
import { fitOls } from './ols'
import { datesToYears } from './time'

export interface SeriesPoint {
  date: Date
  value: number
}

/** OLS fit over an entire (date,value) series. Mirrors the Python
 * run_method(estimator='ols', segmenter='none') path: years are measured from
 * the series' first date. Caller passes only numeric points. */
export function fitGlobal(points: SeriesPoint[]): OlsFit {
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  const years = datesToYears(sorted.map((p) => p.date))
  if (sorted.length === 2) {
    const dx = years[1] - years[0]
    if (dx === 0) {
      return { slope: Number.NaN, intercept: Number.NaN, r2: Number.NaN, ciLow: Number.NaN, ciHigh: Number.NaN, reason: 'identical_timestamps' }
    }
    const slope = (sorted[1].value - sorted[0].value) / dx
    return {
      slope,
      intercept: sorted[0].value - slope * years[0],
      r2: 1,
      ciLow: Number.NaN,
      ciHigh: Number.NaN,
      reason: null,
    }
  }
  return fitOls(years, sorted.map((p) => p.value))
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Python-reference Theil-Sen: median pairwise slope, separate-median
 * intercept and 95% Sen rank bounds with x/y tie correction. R² is undefined.
 * See docs/method-algorithms.md for formulas and boundary behavior. */
export function fitTheilSen(points: SeriesPoint[]): OlsFit {
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  const years = datesToYears(sorted.map((p) => p.date))
  const values = sorted.map((p) => p.value)
  if (sorted.length < 3) {
    return { slope: Number.NaN, intercept: Number.NaN, r2: Number.NaN, ciLow: Number.NaN, ciHigh: Number.NaN, reason: 'n_below_threshold' }
  }
  const slopes: number[] = []
  for (let i = 0; i < years.length; i++) {
    for (let j = i + 1; j < years.length; j++) {
      const dx = years[j] - years[i]
      if (dx !== 0) slopes.push((values[j] - values[i]) / dx)
    }
  }
  if (slopes.length === 0) {
    return { slope: Number.NaN, intercept: Number.NaN, r2: Number.NaN, ciLow: Number.NaN, ciHigh: Number.NaN, reason: 'identical_timestamps' }
  }
  const slope = median(slopes)
  const intercept = median(values) - slope * median(years)
  const [ciLow, ciHigh] = theilSenBounds(slopes, years, values)
  return { slope, intercept, r2: Number.NaN, ciLow, ciHigh, reason: null }
}

function tieCorrection(values: number[]): number {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let correction = 0
  for (const count of counts.values()) correction += count * (count - 1) * (2 * count + 5)
  return correction
}

/** NumPy rounds exact half-integers to even, unlike Math.round. */
function roundEven(value: number): number {
  const lower = Math.floor(value)
  return value - lower === 0.5 ? lower + lower % 2 : Math.round(value)
}

function theilSenBounds(slopes: number[], years: number[], values: number[]): [number, number] {
  const n = values.length
  const variance = (n * (n - 1) * (2 * n + 5) - tieCorrection(years) - tieCorrection(values)) / 18
  if (variance < 0 || !Number.isFinite(variance)) return [Number.NaN, Number.NaN]
  const ranks = [...slopes].sort((a, b) => a - b)
  const width = 1.959963984540054 * Math.sqrt(variance) // Normal 97.5th percentile.
  const lower = Math.max(0, roundEven((ranks.length - width) / 2) - 1)
  const upper = Math.min(ranks.length - 1, roundEven((ranks.length + width) / 2))
  return [ranks[lower] ?? Number.NaN, ranks[upper] ?? Number.NaN]
}
