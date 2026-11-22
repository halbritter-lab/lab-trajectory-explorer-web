import { describe, expect, it } from 'vitest'
import { fitOls } from '../../src/core/stats/ols'
import { fitGlobal } from '../../src/core/stats/series'
import reference from './ols.json'
import { expectClose } from './tolerance'

// Native R stats::lm on the golden series (issue #79). Closed-form sums in the
// app, QR decomposition in R: agreement to 1e-9 relative (docs/reference-comparisons.md).
const TOL = { rel: 1e-9, abs: 1e-12 }

/** The golden series' years as dates, as the Theil–Sen parity test builds them. */
function yearsToDate(year: number): Date {
  return new Date(Date.UTC(2000, 0, 1) + year * 365.25 * 86_400_000)
}

describe(`OLS against stats::lm (R ${reference.environment.R})`, () => {
  it.each(reference.cases)('$source $name', (c) => {
    const fit = fitOls(c.x, c.y)
    if (c.x.length < 3) {
      // fitOls needs three points; lm fits two exactly (no interval) and nothing below.
      expect(fit.reason).toBe('n_below_threshold')
      if (c.fitted) {
        // fitGlobal's two-point special case (CLAUDE.md) is the exact line through both points.
        const two = fitGlobal(c.x.map((year, i) => ({ date: yearsToDate(year), value: c.y[i] })))
        expectClose(two.slope, c.slope, { rel: 1e-9, abs: 1e-9 }, 'two-point slope')
        expectClose(two.intercept, c.intercept, { rel: 1e-9, abs: 1e-9 }, 'two-point intercept')
      }
      return
    }
    if (!c.fitted) {
      expect(fit.reason).toBe('identical_timestamps')
      return
    }
    expect(fit.reason).toBeNull()
    expectClose(fit.slope, c.slope, TOL, 'slope')
    expectClose(fit.intercept, c.intercept, TOL, 'intercept')
    expectClose(fit.slopeSe, c.slopeSe, TOL, 'slope SE')
    expectClose(fit.ciLow, c.slopeCi95![0], TOL, 'CI low')
    expectClose(fit.ciHigh, c.slopeCi95![1], TOL, 'CI high')
    // R² of a constant series is undefined in both (null in the file, NaN in the app).
    expectClose(fit.r2, c.r2, TOL, 'R²')
  })
})
