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

/** Theil-Sen robust slope over all point pairs. Mirrors the Python
 * global-robust preset's intent: a resistant median pairwise slope, with an
 * intercept from the median residual. CI/R² are not part of this lightweight
 * implementation and are returned as NaN. */
export function fitTheilSen(points: SeriesPoint[]): OlsFit {
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  const years = datesToYears(sorted.map((p) => p.date))
  const values = sorted.map((p) => p.value)
  if (sorted.length < 2) {
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
  const intercept = median(values.map((v, i) => v - slope * years[i]))
  return { slope, intercept, r2: Number.NaN, ciLow: Number.NaN, ciHigh: Number.NaN, reason: null }
}
