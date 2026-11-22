/**
 * Student's t distribution: cumulative distribution and quantile, computed
 * from the regularized incomplete beta function (continued fraction, modified
 * Lentz) with a Lanczos log-gamma. Used for the 95 % critical value above 40
 * degrees of freedom (OD-11, decided 2026-10-07, implemented 2026-11-22);
 * tested against R's `qt` to 1e-9 for the degrees of freedom the app meets.
 */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

/** Natural logarithm of the gamma function for x > 0 (Lanczos, g = 7). */
export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  const z = x - 1
  let sum = LANCZOS[0]
  for (let i = 1; i < LANCZOS.length; i++) sum += LANCZOS[i] / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum)
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 10_000; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return h
}

/** Regularized incomplete beta function I_x(a, b) for a, b > 0. */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x),
  )
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b
}

/** P(T > t) for Student's t with `df` degrees of freedom and t >= 0. */
function upperTail(t: number, df: number): number {
  return 0.5 * regularizedIncompleteBeta(df / (df + t * t), df / 2, 0.5)
}

/** Cumulative distribution function of Student's t with `df` > 0 degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return Number.NaN
  if (t === Number.POSITIVE_INFINITY) return 1
  if (t === Number.NEGATIVE_INFINITY) return 0
  const tail = upperTail(Math.abs(t), df)
  return t >= 0 ? 1 - tail : tail
}

/**
 * Quantile (inverse CDF) of Student's t with `df` > 0 degrees of freedom, for
 * 0 < p < 1. Solved by bisection on the upper tail, which decreases
 * monotonically in t, until the bracket cannot be halved any further.
 */
export function studentTQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1) || !(df > 0)) return Number.NaN
  if (p === 0.5) return 0
  const tail = p > 0.5 ? 1 - p : p
  let lo = 0
  let hi = 1
  while (upperTail(hi, df) > tail) {
    lo = hi
    hi *= 2
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (mid === lo || mid === hi) break
    if (upperTail(mid, df) > tail) lo = mid
    else hi = mid
  }
  const t = (lo + hi) / 2
  return p > 0.5 ? t : -t
}
