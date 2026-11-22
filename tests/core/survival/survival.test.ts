/**
 * Time-to-event estimators (issue #78). The expected values are computed by
 * hand from the definitions (product limit, Greenwood, log-log interval,
 * log-rank O/E/V, Aalen–Johansen); the arithmetic is written out beside each
 * case. The comparison with R `survival` is pending issue #79 (no R in the
 * build environment); docs/method-algorithms/time-to-event.md lists the R
 * calls the comparison will use.
 */
import { describe, expect, it } from 'vitest'
import { aalenJohansen, atRisk, chiSquareUpperTail, curveQuantile, kaplanMeier, logRankTest, Z_975, type SurvivalSubject } from '../../../src/core/survival/survival'

const s = (entry: number, exit: number, status: 0 | 1 | 2): SurvivalSubject => ({ entry, exit, status })

describe('Kaplan–Meier, right-censored', () => {
  // Exits 2 (event), 3 (censored), 5 (event), 7 (event), 8 (censored), all entering at 0.
  const subjects = [s(0, 2, 1), s(0, 3, 0), s(0, 5, 1), s(0, 7, 1), s(0, 8, 0)]
  const km = kaplanMeier(subjects)

  it('multiplies (1 − d/n) at each event time', () => {
    expect(km.steps.map(step => [step.time, step.nRisk, step.nEvent, step.nCensor])).toEqual([[2, 5, 1, 0], [3, 4, 0, 1], [5, 3, 1, 0], [7, 2, 1, 0], [8, 1, 0, 1]])
    // 4/5 = 0.8; 0.8 · 2/3 = 0.5333; 0.5333 · 1/2 = 0.2667
    expect(km.steps.map(step => step.survival)).toEqual([0.8, 0.8, 0.8 * 2 / 3, 0.8 * 2 / 3 / 2, 0.8 * 2 / 3 / 2].map(v => expect.closeTo(v, 12)))
    expect([km.subjects, km.events, km.censored, km.deaths]).toEqual([5, 3, 2, 0])
  })

  it('gives the Greenwood standard error and the log-log interval', () => {
    // Greenwood sum at t = 5: 1/(5·4) + 1/(3·2) = 0.05 + 0.16667 = 0.21667.
    const v = 1 / 20 + 1 / 6
    const survival = 0.8 * 2 / 3
    expect(km.steps[2].stdErr).toBeCloseTo(survival * Math.sqrt(v), 12)
    const se = Math.sqrt(v) / Math.abs(Math.log(survival))
    expect(km.steps[2].lower).toBeCloseTo(survival ** Math.exp(Z_975 * se), 12)
    expect(km.steps[2].upper).toBeCloseTo(survival ** Math.exp(-Z_975 * se), 12)
    // Worked numbers: se(log(−log S)) = sqrt(0.21667)/0.62861 = 0.74049; exp(±1.95996·0.74049) = 4.2690 and 0.23425;
    // 0.53333^4.2690 = 0.0683 and 0.53333^0.23425 = 0.8631.
    expect(km.steps[2].lower).toBeCloseTo(0.0683, 4)
    expect(km.steps[2].upper).toBeCloseTo(0.8631, 4)
  })

  it('takes the median at the first event time with S at or below 0.5', () => {
    // S(5) = 0.533 > 0.5, S(7) = 0.267: median 7. The lower curve is at or below 0.5
    // already at t = 2 (0.8^exp(1.95996 · 1.00208) = 0.2038); the upper curve never
    // (0.969, 0.863, then 0.26667^0.28499 = 0.686 at t = 7): not reached.
    expect(km.median.estimate).toBe(7)
    expect(km.median.lower).toBe(2)
    expect(km.steps[0].lower).toBeCloseTo(0.2038, 4)
    const upperAt7 = km.steps[3].upper
    expect(upperAt7).toBeGreaterThan(0.5)
    expect(km.median.upper).toBeNull()
  })

  it('takes the midpoint of a flat stretch at exactly 0.5', () => {
    // 4 subjects: events at 1 and 2 → S = 0.75, 0.5; next event at 4 → median (2 + 4) / 2 = 3.
    const flat = kaplanMeier([s(0, 1, 1), s(0, 2, 0), s(0, 3, 1), s(0, 4, 1), s(0, 5, 0), s(0, 6, 0)])
    // n = 6: S(1) = 5/6; S(3) = 5/6 · 3/4 = 0.625; S(4) = 0.625 · 2/3 = 0.41667 → median 4.
    expect(flat.median.estimate).toBe(4)
    const steps = [{ time: 2, v: 0.75 }, { time: 3, v: 0.5 }, { time: 7, v: 0.25 }]
    expect(curveQuantile(steps, step => step.v, 0.5)).toBe(5)
  })
})

describe('Kaplan–Meier with delayed entry', () => {
  // (entry, exit, status): at risk when entry < t <= exit.
  const subjects = [s(0, 4, 1), s(2, 5, 0), s(3, 6, 1), s(1, 3, 1), s(5, 8, 1)]
  const km = kaplanMeier(subjects)

  it('uses the left-truncated risk sets', () => {
    // t = 3: subjects 1, 2, 4 (subject 3 enters at 3, not yet at risk) → n = 3, S = 2/3.
    // t = 4: subjects 1, 2, 3 → n = 3, S = 4/9. t = 5: subjects 2, 3 (5 enters at 5) → censoring.
    // t = 6: subjects 3, 5 → n = 2, S = 2/9. t = 8: subject 5 alone → S = 0.
    expect(km.steps.map(step => [step.time, step.nRisk, step.nEvent, step.nCensor])).toEqual([[3, 3, 1, 0], [4, 3, 1, 0], [5, 2, 0, 1], [6, 2, 1, 0], [8, 1, 1, 0]])
    expect(km.steps.map(step => step.survival)).toEqual([2 / 3, 4 / 9, 4 / 9, 2 / 9, 0].map(v => expect.closeTo(v, 12)))
    expect(km.steps[3].stdErr).toBeCloseTo((2 / 9) * Math.sqrt(1 / 6 + 1 / 6 + 1 / 2), 12)
    expect(km.steps[4].stdErr).toBeNaN()
    expect(km.median.estimate).toBe(4)
    expect(atRisk(subjects, 3)).toBe(3)
  })
})

describe('log-rank test', () => {
  it('sums observed, expected and the hypergeometric variance', () => {
    // A: events at 1 and 3, censored at 4. B: events at 2 and 5, censored at 6.
    // t=1: n 3+3, d 1 → E_A 0.5, V 0.25; t=2: n 2+3 → E_A 0.4, V 0.24;
    // t=3: n 2+2 → E_A 0.5, V 0.25; t=5: n 0+2 → E_A 0, V 0.
    // O_A = 2, E_A = 1.4, V = 0.74: χ² = 0.6² / 0.74 = 0.48649.
    const result = logRankTest([
      { label: 'A', subjects: [s(0, 1, 1), s(0, 3, 1), s(0, 4, 0)] },
      { label: 'B', subjects: [s(0, 2, 1), s(0, 5, 1), s(0, 6, 0)] },
    ])
    expect(result.groups.map(group => [group.observed, group.expected])).toEqual([[2, 0.5 + 0.4 + 0.5], [2, 0.5 + 0.6 + 0.5 + 1]])
    expect(result.groups[0].variance).toBeCloseTo(0.74, 12)
    expect(result.chiSquare).toBeCloseTo(0.36 / 0.74, 12)
    expect(result.df).toBe(1)
    // P(χ²₁ > 0.48649) = 2(1 − Φ(0.69749)) = 0.48552
    expect(result.pValue).toBeCloseTo(0.48552, 4)
  })

  it('applies the tie correction d(n − d)/(n − 1)', () => {
    // Two events at t = 1 among n = 4 (2 + 2): E_A = 1, V = 2·2/3 · 0.5 · 0.5 = 1/3.
    const result = logRankTest([
      { label: 'A', subjects: [s(0, 1, 1), s(0, 1, 1)] },
      { label: 'B', subjects: [s(0, 2, 0), s(0, 2, 0)] },
    ])
    expect(result.groups[0].expected).toBe(1)
    expect(result.groups[0].variance).toBeCloseTo(1 / 3, 12)
    expect(result.chiSquare).toBeCloseTo(3, 12)
  })

  it('uses delayed-entry risk sets and three groups', () => {
    const result = logRankTest([
      { label: 'A', subjects: [s(0, 4, 1), s(2, 5, 0)] },
      { label: 'B', subjects: [s(3, 6, 1), s(1, 3, 1)] },
      { label: 'C', subjects: [s(5, 8, 1)] },
    ])
    // t=3: n A2 B1 C0, d B → E 2/3, 1/3, 0. t=4: n A2 B1 → E 2/3, 1/3. t=6: n B1 C1, d B → E 0, 1/2, 1/2. t=8: C alone.
    expect(result.groups.map(group => group.observed)).toEqual([1, 2, 1])
    expect(result.groups[0].expected).toBeCloseTo(4 / 3, 12)
    expect(result.groups[1].expected).toBeCloseTo(2 / 3 + 1 / 2, 12)
    expect(result.groups[2].expected).toBeCloseTo(1 / 2 + 1, 12)
    expect(result.df).toBe(2)
    expect(result.chiSquare).toBeGreaterThan(0)
  })

  it('reports no test with one contributing group', () => {
    const result = logRankTest([{ label: 'A', subjects: [s(0, 1, 1)] }, { label: 'B', subjects: [] }])
    expect(result.chiSquare).toBeNull()
    expect(result.df).toBe(0)
  })
})

describe('chi-square tail', () => {
  it('matches the 5 % critical values', () => {
    expect(chiSquareUpperTail(3.841459, 1)).toBeCloseTo(0.05, 6)
    expect(chiSquareUpperTail(5.991465, 2)).toBeCloseTo(0.05, 6)
    expect(chiSquareUpperTail(9.487729, 4)).toBeCloseTo(0.05, 6)
    expect(chiSquareUpperTail(0.5, 3)).toBeCloseTo(0.918891, 5)
    expect(chiSquareUpperTail(0, 1)).toBe(1)
  })
})

describe('Aalen–Johansen with death as competing event', () => {
  it('weights each cause by the overall event-free probability', () => {
    // t1: n 5, endpoint → F1 0.2, S 0.8. t2: n 4, death → F2 0.2, S 0.6.
    // t3: n 3, endpoint → F1 0.4, S 0.4. t4 censored. t5: n 1, death → F2 0.6, S 0.
    const subjects = [s(0, 1, 1), s(0, 2, 2), s(0, 3, 1), s(0, 4, 0), s(0, 5, 2)]
    const steps = aalenJohansen(subjects)
    expect(steps.map(step => step.time)).toEqual([1, 2, 3, 5])
    expect(steps.map(step => step.endpoint)).toEqual([0.2, 0.2, 0.2 + 0.6 / 3, 0.2 + 0.6 / 3].map(v => expect.closeTo(v, 12)))
    expect(steps.at(-1)!.death).toBeCloseTo(0.6, 12)
    expect(steps.at(-1)!.neither).toBeCloseTo(0, 12)
    // 1 − KM with the deaths censored: S(3) = 0.8 · 2/3, so 1 − KM = 0.4667 > 0.4.
    const km = kaplanMeier(subjects)
    expect(1 - km.steps[2].survival).toBeCloseTo(1 - 0.8 * 2 / 3, 12)
    expect(km.deaths).toBe(2)
  })
})
