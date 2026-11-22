import type { OlsFit } from '../types'
import { studentTQuantile } from './studentT'

const NAN = Number.NaN

function nanFit(reason: OlsFit['reason']): OlsFit {
  return { slope: NAN, intercept: NAN, r2: NAN, ciLow: NAN, ciHigh: NAN, reason }
}

/** Exact critical values above 40 degrees of freedom, computed once per df. */
const EXACT_ABOVE_40 = new Map<number, number>()

/**
 * Two-sided 95 % critical value of Student's t (the 97.5th percentile) for
 * `df` degrees of freedom, truncated to a whole number and at least 1.
 */
export function tCritical95(df: number): number {
  const table: Record<number, number> = {
    1: 12.706204736,
    2: 4.30265273,
    3: 3.182446305,
    4: 2.776445105,
    5: 2.570581836,
    6: 2.446911851,
    7: 2.364624252,
    8: 2.306004135,
    9: 2.262157163,
    10: 2.228138852,
    11: 2.20098516,
    12: 2.17881283,
    13: 2.160368656,
    14: 2.144786688,
    15: 2.131449546,
    16: 2.119905299,
    17: 2.109815578,
    18: 2.10092204,
    19: 2.093024054,
    20: 2.085963447,
    21: 2.079613845,
    22: 2.073873068,
    23: 2.06865761,
    24: 2.063898562,
    25: 2.059538553,
    26: 2.055529439,
    27: 2.051830516,
    28: 2.048407142,
    29: 2.045229642,
    30: 2.042272456,
    31: 2.039513446,
    32: 2.036933343,
    33: 2.034515297,
    34: 2.032244509,
    35: 2.030107928,
    36: 2.028094001,
    37: 2.026192463,
    38: 2.024394164,
    39: 2.02269092,
    40: 2.02107539,
  }
  const whole = Math.max(1, Math.trunc(df))
  if (whole <= 40) return table[whole]
  // Exact Student-t quantile above 40 degrees of freedom (OD-11, implemented
  // 2026-11-22); before, a step function between breakpoints and the normal
  // value above 120 was used. The table above stays so that every value up
  // to 40 degrees of freedom is unchanged bit for bit.
  let value = EXACT_ABOVE_40.get(whole)
  if (value === undefined) {
    value = studentTQuantile(0.975, whole)
    EXACT_ABOVE_40.set(whole, value)
  }
  return value
}

/**
 * Ordinary least-squares slope of `values` against `xYears`.
 * Mirrors analyses/methods.py:_fit_ols_impl: n<3 -> n_below_threshold,
 * zero x-variance -> identical_timestamps, else slope/intercept/r2 with a
 * Student-t 95% CI on the slope.
 */
export function fitOls(xYears: number[], values: number[]): OlsFit {
  const n = xYears.length
  if (n < 3) return nanFit('n_below_threshold')

  const uniqueX = new Set(xYears)
  if (uniqueX.size <= 1) return nanFit('identical_timestamps')

  const meanX = xYears.reduce((a, b) => a + b, 0) / n
  const meanY = values.reduce((a, b) => a + b, 0) / n

  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const dx = xYears[i] - meanX
    const dy = values[i] - meanY
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const r = sxy / Math.sqrt(sxx * syy)
  const r2 = r * r

  // Standard error of the slope (scipy.stats.linregress convention).
  const dfResid = n - 2
  // Float cancellation can drive this slightly negative when residuals ≈ 0,
  // which would make stderr NaN (sqrt of a negative); clamp at 0.
  const ssResid = Math.max(0, syy - slope * sxy) // residual sum of squares
  const stderr = Math.sqrt(ssResid / dfResid / sxx)
  const ciHalf = tCritical95(dfResid) * stderr

  return {
    slope,
    intercept,
    r2,
    ciLow: slope - ciHalf,
    ciHigh: slope + ciHalf,
    slopeSe: stderr,
    reason: null,
  }
}
