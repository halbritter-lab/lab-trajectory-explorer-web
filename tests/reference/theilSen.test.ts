import { describe, expect, it } from 'vitest'
import { fitTheilSen } from '../../src/core/stats/series'
import reference from './theil_sen.json'
import { expectClose } from './tolerance'

// Theil–Sen against mblm and zyp on the golden series (issue #79). Medians of
// identical pairwise quotients: 1e-9 relative covers the date round trip of
// the input years (docs/reference-comparisons.md).
const TOL = { rel: 1e-9, abs: 1e-9 }

function yearsToDate(year: number): Date {
  return new Date(Date.UTC(2000, 0, 1) + year * 365.25 * 86_400_000)
}

/** Cases whose intercept differs between the app's convention,
 * median(y) − slope × median(x) (owner decision for issue #6), and the
 * median(y − slope × x) of mblm and zyp. Documented, not aligned. */
const INTERCEPT_CONVENTION_DIFFERS = ['ols_1', 'odd_pair_count', 'even_pair_count', 'repeated_dates', 'interior_ci_ranks', 'tied_x_and_y']

/** Cases whose 95 % slope interval differs from zyp's confint (OD-87): the
 * app's upper bound is one rank higher, and with few points zyp's ranks fall
 * outside the sorted slopes. */
const INTERVAL_DIFFERS = ['ols_1', 'ols_2', 'gross_outlier', 'odd_pair_count', 'even_pair_count', 'repeated_dates', 'interior_ci_ranks']

describe(`Theil–Sen against mblm and zyp (R ${reference.environment.R})`, () => {
  it.each(reference.cases)('$source $name', (c) => {
    const fit = fitTheilSen(c.x.map((year, i) => ({ date: yearsToDate(year), value: c.y[i] })))
    if (!c.fitted || !c.mblm || !c.zyp) {
      expect(c.fitted).toBe(false)
      expect(fit.reason).not.toBeNull()
      return
    }
    expect(fit.reason).toBeNull()
    // Slope: the median of the pairwise slopes in all three implementations.
    expectClose(fit.slope, c.pairwiseSlopeMedian, TOL, 'slope vs median of pairwise slopes')
    expectClose(fit.slope, c.mblm.slope, TOL, 'slope vs mblm')
    expectClose(fit.slope, c.zyp.slope, TOL, 'slope vs zyp')
    // Intercept: the app's convention recomputed in R; mblm and zyp agree with each other.
    expectClose(fit.intercept, c.interceptMedianYMinusSlopeMedianX, TOL, 'intercept, app convention')
    expectClose(c.zyp.intercept, c.mblm.intercept, TOL, 'zyp vs mblm intercept')
    const interceptDiffers = Math.abs(fit.intercept - c.mblm.intercept!) > 1e-9
    expect(interceptDiffers, 'intercept convention difference list').toBe(INTERCEPT_CONVENTION_DIFFERS.includes(c.name))
    // Interval: Sen's normal approximation in both; ranks differ (OD-87).
    const z = c.zyp.slopeCi95
    const intervalDiffers = z === null || Math.abs(fit.ciLow - z[0]) > 1e-9 || Math.abs(fit.ciHigh - z[1]) > 1e-9
    expect(intervalDiffers, `interval [${fit.ciLow}, ${fit.ciHigh}] vs zyp [${z}]`).toBe(INTERVAL_DIFFERS.includes(c.name))
  })
})
