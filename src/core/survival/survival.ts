/**
 * Time-to-event estimators for left-truncated, right-censored data (issue #78,
 * owner decisions `km` and `death` of 2026-11-22). Times are numbers on one
 * scale (the callers pass whole days); a subject is at risk at time t when
 * entry < t <= exit, the counting-process convention of R's
 * `Surv(entry, exit, status)`. Research use only.
 *
 * - `kaplanMeier`: product-limit estimate with Greenwood variance and a
 *   pointwise log-log interval; the median and its interval by
 *   Brookmeyer–Crowley on that interval (R `survfit`, `conf.type = "log-log"`).
 * - `logRankTest`: log-rank test between groups on the same risk sets, with the
 *   hypergeometric variance and a generalised inverse (R `survdiff` for
 *   right-censored data).
 * - `aalenJohansen`: cumulative incidence of the endpoint with death as the
 *   competing event (R `survfit` multi-state).
 */
import { logGamma } from '../stats/studentT'

/** 0 censored, 1 endpoint, 2 death (competing event; censored in `kaplanMeier`). */
export type SurvivalStatus = 0 | 1 | 2

export interface SurvivalSubject {
  entry: number
  exit: number
  status: SurvivalStatus
}

export interface KaplanMeierStep {
  time: number
  nRisk: number
  /** Endpoint events at `time`. */
  nEvent: number
  /** Subjects leaving at `time` without the endpoint (censored or died). */
  nCensor: number
  /** Of `nCensor`, those who died. */
  nDeath: number
  survival: number
  /** Greenwood standard error of `survival`; NaN once survival is 0. */
  stdErr: number
  lower: number
  upper: number
}

export interface QuantileEstimate {
  /** Null when the curve does not reach the probability ("not reached"). */
  estimate: number | null
  lower: number | null
  upper: number | null
}

export interface KaplanMeierResult {
  subjects: number
  events: number
  censored: number
  deaths: number
  steps: KaplanMeierStep[]
  median: QuantileEstimate
}

/** The 97.5 % quantile of the standard normal distribution (R `qnorm(0.975)`). */
export const Z_975 = 1.959963984540054
/** Tolerance for "the curve is exactly at the probability". */
const QUANTILE_TOLERANCE = 1e-10

function distinctSorted(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

/** Subjects at risk at `time`: entry < time <= exit. */
export function atRisk(subjects: readonly SurvivalSubject[], time: number): number {
  let n = 0
  for (const s of subjects) if (s.entry < time && time <= s.exit) n++
  return n
}

/** Log-log interval of one survival value: S^exp(±z·sqrt(V)/log S), where V
 * is the Greenwood sum (variance of log S). 1 and 1 at S = 1, NaN at S = 0. */
function logLogInterval(survival: number, greenwood: number): [number, number] {
  if (survival >= 1) return [1, 1]
  if (!(survival > 0) || !Number.isFinite(greenwood)) return [Number.NaN, Number.NaN]
  const se = Math.sqrt(greenwood) / Math.abs(Math.log(survival))
  return [survival ** Math.exp(Z_975 * se), survival ** Math.exp(-Z_975 * se)]
}

export function kaplanMeier(subjects: readonly SurvivalSubject[]): KaplanMeierResult {
  const times = distinctSorted(subjects.map(s => s.exit))
  const steps: KaplanMeierStep[] = []
  let survival = 1
  let greenwood = 0
  for (const time of times) {
    const nRisk = atRisk(subjects, time)
    let nEvent = 0
    let nCensor = 0
    let nDeath = 0
    for (const s of subjects) {
      if (s.exit !== time) continue
      if (s.status === 1) nEvent++
      else { nCensor++; if (s.status === 2) nDeath++ }
    }
    if (nEvent > 0) {
      survival *= 1 - nEvent / nRisk
      greenwood = nRisk > nEvent ? greenwood + nEvent / (nRisk * (nRisk - nEvent)) : Number.NaN
    }
    const [lower, upper] = logLogInterval(survival, greenwood)
    steps.push({ time, nRisk, nEvent, nCensor, nDeath, survival, stdErr: survival > 0 ? survival * Math.sqrt(greenwood) : Number.NaN, lower, upper })
  }
  const eventSteps = steps.filter(step => step.nEvent > 0)
  const lastTime = steps.at(-1)?.time
  const median: QuantileEstimate = {
    estimate: curveQuantile(eventSteps, step => step.survival, 0.5, lastTime),
    // The lower curve reaches 0.5 first, so it gives the lower limit.
    lower: curveQuantile(eventSteps, step => step.lower, 0.5, lastTime),
    upper: curveQuantile(eventSteps, step => step.upper, 0.5, lastTime),
  }
  return {
    subjects: subjects.length,
    events: subjects.filter(s => s.status === 1).length,
    censored: subjects.filter(s => s.status !== 1).length,
    deaths: subjects.filter(s => s.status === 2).length,
    steps,
    median,
  }
}

/**
 * The first event time at which a step curve is at or below `p`. When the
 * curve equals `p` (within 1e-10) at that time, the midpoint between it and
 * the next event time, or, after the last event time, the last time of the
 * curve (`lastTime`, an exit time), as R's `quantile.survfit` takes the
 * middle of a flat stretch at exactly `p` (checked against R survival 3.5-8,
 * tests/reference/time_to_event.json). Null when the curve stays above `p` or
 * is undefined there (NaN).
 */
export function curveQuantile<T extends { time: number }>(eventSteps: readonly T[], value: (step: T) => number, p: number, lastTime?: number): number | null {
  for (let i = 0; i < eventSteps.length; i++) {
    const v = value(eventSteps[i])
    if (!Number.isFinite(v)) return null
    if (v <= p + QUANTILE_TOLERANCE) {
      if (Math.abs(v - p) <= QUANTILE_TOLERANCE) {
        const next = i + 1 < eventSteps.length ? eventSteps[i + 1].time : lastTime
        if (next !== undefined && next > eventSteps[i].time) return (eventSteps[i].time + next) / 2
      }
      return eventSteps[i].time
    }
  }
  return null
}

/** The value of a step curve at `time` (right-continuous; 1 before the first step). */
export function stepValueAt<T extends { time: number }>(steps: readonly T[], value: (step: T) => number, time: number, initial = 1): number {
  let current = initial
  for (const step of steps) {
    if (step.time > time) break
    current = value(step)
  }
  return current
}

export interface LogRankGroup {
  label: string
  subjects: readonly SurvivalSubject[]
}

export interface LogRankResult {
  groups: { label: string; subjects: number; observed: number; expected: number; variance: number }[]
  /** Null when fewer than two groups contribute expected events. */
  chiSquare: number | null
  df: number
  pValue: number | null
}

/**
 * Log-rank test on the risk sets entry < t <= exit. At each distinct endpoint
 * time t with d events among n at risk (n_g in group g):
 * E_g += d n_g / n and V_gh += d (n − d) / (n − 1) · n_g / n · (δ_gh − n_h / n)
 * (no contribution when n = 1). The statistic is (O − E)' V⁻ (O − E) over the
 * groups with positive variance less the last of them; df is their number
 * less one.
 */
export function logRankTest(groups: readonly LogRankGroup[]): LogRankResult {
  const k = groups.length
  const observed = new Array<number>(k).fill(0)
  const expected = new Array<number>(k).fill(0)
  const variance: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  const times = distinctSorted(groups.flatMap(group => group.subjects.filter(s => s.status === 1).map(s => s.exit)))
  for (const time of times) {
    const nByGroup = groups.map(group => atRisk(group.subjects, time))
    const dByGroup = groups.map(group => group.subjects.filter(s => s.status === 1 && s.exit === time).length)
    const n = nByGroup.reduce((a, b) => a + b, 0)
    const d = dByGroup.reduce((a, b) => a + b, 0)
    if (n === 0 || d === 0) continue
    for (let g = 0; g < k; g++) {
      observed[g] += dByGroup[g]
      expected[g] += (d * nByGroup[g]) / n
    }
    if (n < 2) continue
    const factor = (d * (n - d)) / (n - 1)
    for (let g = 0; g < k; g++) {
      for (let h = 0; h < k; h++) {
        variance[g][h] += factor * (nByGroup[g] / n) * ((g === h ? 1 : 0) - nByGroup[h] / n)
      }
    }
  }
  const kept = groups.map((_, g) => g).filter(g => variance[g][g] > 1e-12)
  const used = kept.slice(0, -1)
  const summary = groups.map((group, g) => ({ label: group.label, subjects: group.subjects.length, observed: observed[g], expected: expected[g], variance: variance[g][g] }))
  if (used.length === 0) return { groups: summary, chiSquare: null, df: 0, pValue: null }
  const u = used.map(g => observed[g] - expected[g])
  const v = used.map(g => used.map(h => variance[g][h]))
  const solved = solveLinear(v, u)
  if (solved === null) return { groups: summary, chiSquare: null, df: 0, pValue: null }
  const chiSquare = u.reduce((sum, value, i) => sum + value * solved[i], 0)
  const df = used.length
  return { groups: summary, chiSquare, df, pValue: chiSquareUpperTail(chiSquare, df) }
}

/** Gaussian elimination with partial pivoting; null for a singular matrix. */
function solveLinear(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length
  const a = matrix.map((row, i) => [...row, vector[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    if (Math.abs(a[pivot][col]) < 1e-12) return null
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const f = a[row][col] / a[col][col]
      for (let c = col; c <= n; c++) a[row][c] -= f * a[col][c]
    }
  }
  return a.map((row, i) => row[n] / row[i])
}

/** P(X > x) for a chi-square variable with `df` degrees of freedom: the
 * regularised upper incomplete gamma Q(df/2, x/2) (series below a + 1, else
 * Lentz's continued fraction). */
export function chiSquareUpperTail(x: number, df: number): number {
  if (!(x > 0)) return 1
  const a = df / 2
  const z = x / 2
  const lnPrefix = a * Math.log(z) - z - logGamma(a)
  if (z < a + 1) {
    let term = 1 / a
    let sum = term
    for (let n = 1; n < 1000; n++) {
      term *= z / (a + n)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break
    }
    return Math.max(0, 1 - sum * Math.exp(lnPrefix))
  }
  const tiny = 1e-300
  let b = z + 1 - a
  let c = 1 / tiny
  let d = 1 / b
  let h = d
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < tiny) d = tiny
    c = b + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 1e-15) break
  }
  return Math.min(1, Math.exp(lnPrefix) * h)
}

export interface CumulativeIncidenceStep {
  time: number
  nRisk: number
  nEvent: number
  nDeath: number
  /** Aalen–Johansen cumulative incidence of the endpoint. */
  endpoint: number
  /** Aalen–Johansen cumulative incidence of death before the endpoint. */
  death: number
  /** Probability of neither (overall product-limit estimate). */
  neither: number
}

/**
 * Aalen–Johansen estimate with two absorbing states, endpoint (status 1) and
 * death (status 2), on the risk sets entry < t <= exit: at each time with
 * d1 endpoints and d2 deaths among n at risk, F1 += S(t−) d1 / n,
 * F2 += S(t−) d2 / n and S(t) = S(t−)(1 − (d1 + d2) / n).
 */
export function aalenJohansen(subjects: readonly SurvivalSubject[]): CumulativeIncidenceStep[] {
  const times = distinctSorted(subjects.filter(s => s.status !== 0).map(s => s.exit))
  const steps: CumulativeIncidenceStep[] = []
  let neither = 1
  let endpoint = 0
  let death = 0
  for (const time of times) {
    const nRisk = atRisk(subjects, time)
    const nEvent = subjects.filter(s => s.exit === time && s.status === 1).length
    const nDeath = subjects.filter(s => s.exit === time && s.status === 2).length
    endpoint += (neither * nEvent) / nRisk
    death += (neither * nDeath) / nRisk
    neither *= 1 - (nEvent + nDeath) / nRisk
    steps.push({ time, nRisk, nEvent, nDeath, endpoint, death, neither })
  }
  return steps
}
