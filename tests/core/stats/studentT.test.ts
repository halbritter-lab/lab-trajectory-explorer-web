import { describe, expect, it } from 'vitest'
import { studentTCdf, studentTQuantile } from '../../../src/core/stats/studentT'
import { fitOls, tCritical95 } from '../../../src/core/stats/ols'

// Reference values from R: qt(0.975, df), printed with nine decimals.
const QT_975: Array<[number, number]> = [
  [1, 12.706204736],
  [2, 4.30265273],
  [3, 3.182446305],
  [5, 2.570581836],
  [10, 2.228138852],
  [30, 2.042272456],
  [40, 2.02107539],
  [41, 2.01954097],
  [50, 2.008559112],
  [60, 2.000297822],
  [80, 1.990063421],
  [100, 1.983971519],
  [120, 1.979930405],
  [121, 1.979763763],
  [200, 1.971896224],
  [500, 1.964719837],
  [1000, 1.962339081],
]

describe('studentTQuantile (OD-11)', () => {
  it.each(QT_975)('matches qt(0.975, %i)', (df, expected) => {
    expect(Math.abs(studentTQuantile(0.975, df) - expected)).toBeLessThan(1e-9)
  })

  it('is symmetric and inverts the CDF', () => {
    expect(studentTQuantile(0.025, 41)).toBeCloseTo(-2.01954097, 8)
    expect(studentTQuantile(0.5, 7)).toBe(0)
    for (const df of [1, 3, 41, 250]) {
      for (const p of [0.01, 0.2, 0.9, 0.975]) {
        expect(studentTCdf(studentTQuantile(p, df), df)).toBeCloseTo(p, 12)
      }
    }
  })

  it('matches pt and approaches the normal quantile', () => {
    expect(studentTCdf(-1, 5)).toBeCloseTo(0.181608734, 9) // pt(-1, 5)
    expect(studentTCdf(0, 12)).toBe(0.5)
    expect(Math.abs(studentTQuantile(0.975, 1e6) - 1.959966357)).toBeLessThan(1e-8)
  })

  it('rejects invalid input', () => {
    expect(studentTQuantile(0, 5)).toBeNaN()
    expect(studentTQuantile(1, 5)).toBeNaN()
    expect(studentTQuantile(0.975, 0)).toBeNaN()
    expect(studentTCdf(1, -1)).toBeNaN()
  })
})

describe('tCritical95', () => {
  it('keeps the tabulated value up to 40 degrees of freedom bit for bit', () => {
    expect(tCritical95(1)).toBe(12.706204736)
    expect(tCritical95(2)).toBe(4.30265273)
    expect(tCritical95(40)).toBe(2.02107539)
    expect(tCritical95(0.4)).toBe(12.706204736)
    // The table agrees with the exact quantile to its nine decimals.
    for (let df = 1; df <= 40; df++) {
      expect(Math.abs(tCritical95(df) - studentTQuantile(0.975, df))).toBeLessThan(6e-10)
    }
  })

  it('uses the exact quantile above 40 degrees of freedom, truncating a fractional df', () => {
    for (const [df, expected] of QT_975.filter(([df]) => df > 40)) {
      expect(Math.abs(tCritical95(df) - expected)).toBeLessThan(1e-9)
    }
    expect(tCritical95(60.9)).toBe(tCritical95(60))
  })

  it('reproduces the worked example of 62 monthly points (df 60)', () => {
    const x = Array.from({ length: 62 }, (_, i) => i / 12)
    const y = x.map((v, i) => 60 - 2 * v + (i % 2 ? 0.5 : -0.5))
    const fit = fitOls(x, y)
    expect(fit.slope).toBeCloseTo(-1.990632, 6)
    expect(fit.slopeSe).toBeCloseTo(0.043267, 6)
    expect(fit.ciLow).toBeCloseTo(-2.07718, 6)
    expect(fit.ciHigh).toBeCloseTo(-1.904084, 6)
  })
})
