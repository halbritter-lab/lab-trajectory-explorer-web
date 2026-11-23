import { describe, expect, it } from 'vitest'
import { computeCkdEndpoints, type EndpointPoint } from '../../../src/core/domains/nephrology/endpoints/ckdEndpoints'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

function point(date: string, value: number, ageYears?: number): EndpointPoint {
  return { date: d(date), value, ageYears: ageYears ?? null }
}

describe('computeCkdEndpoints', () => {
  const observed = { percentDecline: false, observedCkdG4: true, observedCkdG5: true, projectedAgeToCkdG5: false }
  it('preserves the first confirmed event and records later recovery separately', () => {
    const result = computeCkdEndpoints({ points: [point('2020-01-01', 14), point('2020-05-01', 13), point('2020-09-01', 12), point('2020-11-01', 20)], slopePerYear: -1, enabled: observed })
    expect(result.observedCkdG5).toMatchObject({ met: true, firstDate: d('2020-01-01'), confirmedDate: d('2020-05-01'), firstValue: 14, confirmedValue: 13, recoveryDate: d('2020-11-01'), recoveryValue: 20 })
    expect(result.observedCkdG4.met).toBe(true)
    expect(result.observedCkdG4.recoveryDate).toBeNull()
  })
  it('starts a new candidate after recovery before confirmation', () => {
    const result = computeCkdEndpoints({ points: [point('2020-01-01', 14), point('2020-03-01', 20), point('2020-05-01', 13), point('2020-08-01', 12)], slopePerYear: -1, enabled: observed })
    expect(result.observedCkdG5.firstDate).toEqual(d('2020-05-01'))
    expect(result.observedCkdG5.confirmedDate).toEqual(d('2020-08-01'))
  })
  it('uses the configured minimum interval including its exact boundary', () => {
    const input = { points: [point('2020-01-01', 14), point('2020-01-31', 13)], slopePerYear: -1, enabled: observed }
    expect(computeCkdEndpoints({ ...input, confirmationDays: 30 }).observedCkdG5.met).toBe(true)
    expect(computeCkdEndpoints({ ...input, confirmationDays: 31 }).observedCkdG5.met).toBe(false)
    expect(computeCkdEndpoints({ ...input, confirmationDays: -1 }).observedCkdG5.met).toBe(false)
  })
  it('treats equality as recovery and ignores invalid measurements without mutating input', () => {
    const points = [point('2020-05-01', 13), point('2020-03-01', 15), point('2020-01-01', 14), { date: new Date('bad'), value: 2, ageYears: null }, point('2020-02-01', Number.NaN)]
    const dates = points.map(p => p.date)
    const result = computeCkdEndpoints({ points, slopePerYear: -1, enabled: observed })
    expect(result.observedCkdG5.met).toBe(false)
    expect(points.map(p => p.date)).toEqual(dates)
  })
  it('does not let conflicting observations at the confirmation timestamp create an event', () => {
    for (const values of [[13, 20], [20, 13]]) {
      const points = [point('2020-01-01', 14), ...values.map(v => point('2020-05-01', v))]
      expect(computeCkdEndpoints({ points, slopePerYear: -1, enabled: observed }).observedCkdG5.met).toBe(false)
    }
  })
  it('confirms at twelve calendar months and restarts an expired G5 candidate', () => {
    const atBoundary = computeCkdEndpoints({ points: [point('2020-02-29', 14), point('2021-02-28', 13)], slopePerYear: -1, enabled: observed })
    expect(atBoundary.observedCkdG5).toMatchObject({ met: true, firstDate: d('2020-02-29'), confirmedDate: d('2021-02-28') })
    const expired = computeCkdEndpoints({ points: [point('2020-02-29', 14), point('2021-03-01', 13), point('2021-06-01', 12)], slopePerYear: -1, enabled: observed })
    expect(expired.observedCkdG5).toMatchObject({ met: true, firstDate: d('2021-03-01'), confirmedDate: d('2021-06-01') })
    expect(expired.observedCkdG4.firstDate).toEqual(d('2021-03-01'))
  })
  it('includes the entire UTC anniversary day in the maximum confirmation window', () => {
    const result = computeCkdEndpoints({ points: [
      { date: new Date('2020-01-01T08:00:00Z'), value: 14, ageYears: null },
      { date: new Date('2021-01-01T23:00:00Z'), value: 13, ageYears: null },
    ], slopePerYear: -1, enabled: observed })
    expect(result.observedCkdG5.met).toBe(true)
  })
  it('uses the inclusive first 90 UTC days as a mean baseline and searches candidates from day 91', () => {
    const result = computeCkdEndpoints({ points: [point('2020-01-01', 100), point('2020-03-31', 50), point('2020-04-01', 45), point('2020-07-01', 44)], slopePerYear: -1, enabled: { ...observed, percentDecline: true } })
    expect(result.declineBaselineValue).toBe(75)
    expect(result.observedDecline40).toMatchObject({ met: true, firstDate: d('2020-04-01'), confirmedDate: d('2020-07-01'), firstValue: 45 })
    expect(result.observedDecline57.met).toBe(false)
    expect(result.percentDecline.value).toBeCloseTo(56)
  })
  it('includes the whole UTC calendar day 90 in the baseline regardless of time of day', () => {
    const result = computeCkdEndpoints({ points: [
      { date: new Date('2020-01-01T08:00:00Z'), value: 100, ageYears: null },
      { date: new Date('2020-03-31T23:00:00Z'), value: 50, ageYears: null },
      point('2020-04-01', 45), point('2020-07-01', 44),
    ], slopePerYear: -1, enabled: { ...observed, percentDecline: true } })
    expect(result.declineBaselineValue).toBe(75)
    expect(result.observedDecline40.firstDate).toEqual(d('2020-04-01'))
  })
  it('counts duplicate baseline rows and exact 40/57 percent boundaries independently', () => {
    const result = computeCkdEndpoints({ points: [point('2020-01-01', 100), point('2020-01-01', 100), point('2020-04-01', 60), point('2020-07-01', 60), point('2020-08-01', 43), point('2020-11-01', 43), point('2020-12-01', 61)], slopePerYear: -1, enabled: { ...observed, percentDecline: true } })
    expect(result.declineBaselineValue).toBe(100)
    expect(result.observedDecline40).toMatchObject({ met: true, firstDate: d('2020-04-01'), confirmedDate: d('2020-07-01'), recoveryDate: d('2020-12-01') })
    expect(result.observedDecline57).toMatchObject({ met: true, firstDate: d('2020-08-01'), confirmedDate: d('2020-11-01'), recoveryDate: d('2020-12-01') })
  })
  it('does not produce decline events from a nonpositive baseline or just-below thresholds', () => {
    const enabled = { ...observed, percentDecline: true }
    const nonpositive = computeCkdEndpoints({ points: [point('2020-01-01', 0), point('2020-04-01', -1), point('2020-08-01', -2)], slopePerYear: -1, enabled })
    expect(nonpositive.observedDecline40.met).toBe(false)
    expect(nonpositive.observedDecline57.met).toBe(false)
    const below = computeCkdEndpoints({ points: [point('2020-01-01', 100), point('2020-04-01', 60.0001), point('2020-08-01', 43.0001)], slopePerYear: -1, enabled })
    expect(below.observedDecline40.met).toBe(false)
    expect(below.observedDecline57.met).toBe(false)
  })
  it('applies minimum and maximum boundaries to decline confirmations and restarts expired candidates', () => {
    const enabled = { ...observed, percentDecline: true }
    const points = [point('2020-01-01', 100), point('2020-04-01', 60), point('2021-04-01', 59), point('2021-04-02', 58), point('2021-07-01', 57)]
    const result = computeCkdEndpoints({ points, slopePerYear: -1, enabled })
    expect(result.observedDecline40).toMatchObject({ met: true, firstDate: d('2020-04-01'), confirmedDate: d('2021-04-01') })
    const expired = computeCkdEndpoints({ points: [point('2020-01-01', 100), point('2020-04-01', 60), point('2021-04-02', 59), point('2021-07-01', 58)], slopePerYear: -1, enabled })
    expect(expired.observedDecline40).toMatchObject({ met: true, firstDate: d('2021-04-02'), confirmedDate: d('2021-07-01') })
    const short = computeCkdEndpoints({ points: [point('2020-01-01', 100), point('2020-04-01', 60), point('2020-06-29', 59)], slopePerYear: -1, enabled })
    expect(short.observedDecline40.met).toBe(false)
  })
  it('lets same-time noncrossing values interrupt a decline candidate in either source order', () => {
    for (const values of [[59, 61], [61, 59]]) {
      const result = computeCkdEndpoints({ points: [point('2020-01-01', 100), point('2020-04-01', 60), ...values.map(value => point('2020-07-01', value))], slopePerYear: -1, enabled: { ...observed, percentDecline: true } })
      expect(result.observedDecline40.met).toBe(false)
    }
  })
  it('retains source order for tied qualifying decline measurements', () => {
    const result = computeCkdEndpoints({ points: [point('2020-01-01', 100), point('2020-04-01', 59), point('2020-04-01', 58), point('2020-07-01', 57), point('2020-07-01', 56)], slopePerYear: -1, enabled: { ...observed, percentDecline: true } })
    expect(result.observedDecline40).toMatchObject({ met: true, firstValue: 59, confirmedValue: 57 })
  })
  it('projects from the fitted curve rather than the final measurement', () => {
    // Four dates over three years (KDIGO minimum since 2026-11-22). The fitted
    // line is at 27.5 at the latest point, which measured 25: (27.5 - 15) / 17.5
    // = 0.714 years remain, not (25 - 15) / 17.5 = 0.571 from the measurement.
    // On 1 January 2020 to 2023 the span is 1096 days, so about 0.7137 years remain.
    const points = [77.5, 60, 50, 25].map((value, i) => point(`${2020 + i}-01-01`, value, 60 + i))
    const result = computeCkdEndpoints({ points, slopePerYear: -17.5, intercept: 80, slopeCiLow: -20, slopeCiHigh: -15, enabled: { ...observed, projectedAgeToCkdG5: true } })
    expect(result.projectedAgeToCkdG5.value).toBeCloseTo(63 + 65 / 17.5 - 1096 / 365.25, 6)
  })
  it('computes percent decline from first to latest included eGFR value', () => {
    const endpoints = computeCkdEndpoints({
      points: [point('2020-01-01', 60), point('2021-01-01', 45), point('2022-01-01', 30)],
      slopePerYear: -15,
      enabled: { percentDecline: true, observedCkdG5: false, projectedAgeToCkdG5: false },
    })

    expect(endpoints.percentDecline.value).toBeCloseTo(50)
    expect(endpoints.percentDecline.baselineValue).toBe(60)
    expect(endpoints.percentDecline.latestValue).toBe(30)
  })

  it('requires persistent eGFR below 15 for at least 90 days for observed CKD G5', () => {
    const shortLow = computeCkdEndpoints({
      points: [point('2020-01-01', 16), point('2020-02-01', 14), point('2020-03-01', 13)],
      slopePerYear: -5,
      enabled: { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: false },
    })
    expect(shortLow.observedCkdG5.met).toBe(false)

    const persistentLow = computeCkdEndpoints({
      points: [point('2020-01-01', 16), point('2020-02-01', 14), point('2020-05-05', 13)],
      slopePerYear: -5,
      enabled: { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: false },
    })
    expect(persistentLow.observedCkdG5.met).toBe(true)
    expect(persistentLow.observedCkdG5.firstDate?.toISOString().slice(0, 10)).toBe('2020-02-01')
    expect(persistentLow.observedCkdG5.confirmedDate?.toISOString().slice(0, 10)).toBe('2020-05-05')
  })

  it('does not count CKD G5 when eGFR recovers to 15 or higher after the first low value', () => {
    const endpoints = computeCkdEndpoints({
      points: [
        point('2020-01-01', 16),
        point('2020-02-01', 14),
        point('2020-04-01', 18),
        point('2020-06-01', 13),
      ],
      slopePerYear: -5,
      enabled: { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: false },
    })

    expect(endpoints.observedCkdG5.met).toBe(false)
  })

  it('projects age to CKD G5 from the fitted curve and negative slope', () => {
    const endpoints = computeCkdEndpoints({
      points: [point('2019-01-01', 55, 59), point('2020-01-01', 45, 60), point('2021-01-01', 35, 61), point('2022-01-01', 25, 62)],
      slopePerYear: -10,
      intercept: 55,
      slopeCiLow: -12,
      slopeCiHigh: -8,
      enabled: { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: true },
    })

    expect(endpoints.projectedAgeToCkdG5.value).toBeCloseTo(63, 1)
    expect(endpoints.projectedAgeToCkdG5.reason).toBeNull()
  })

  it('does not project age when observed CKD G5 is already met', () => {
    const endpoints = computeCkdEndpoints({
      points: [point('2020-01-01', 20, 60), point('2021-01-01', 14, 61), point('2021-05-01', 13, 61.3)],
      slopePerYear: -6,
      enabled: { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: true },
    })

    expect(endpoints.observedCkdG5.met).toBe(true)
    expect(endpoints.projectedAgeToCkdG5.value).toBeNull()
    expect(endpoints.projectedAgeToCkdG5.reason).toBe('observed_ckd_g5')
  })

  it('reports that no projection fit exists instead of calling it non-declining', () => {
    const endpoints = computeCkdEndpoints({
      points: [point('2020-01-01', 60, 60), point('2021-06-01', 40, 61.5), point('2022-01-01', 30, 62), point('2023-01-01', 20, 63)],
      slopePerYear: Number.NaN,
      enabled: { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: true },
    })

    expect(endpoints.projectedAgeToCkdG5.reason).toBe('no_fit')
  })

  it('withholds a crossing when the endpoint slope CI touches zero', () => {
    const result = computeCkdEndpoints({ points: [point('2020-01-01', 60, 60), point('2021-01-01', 50, 61), point('2022-01-01', 40, 62), point('2023-01-01', 30, 63)], slopePerYear: -10, intercept: 60, slopeCiLow: -12, slopeCiHigh: 0, enabled: { ...observed, projectedAgeToCkdG5: true } })
    expect(result.projectedAgeToCkdG5).toMatchObject({ value: null, reason: 'slope_ci_includes_zero' })
  })
  it('distinguishes unavailable endpoint fit bounds', () => {
    const result = computeCkdEndpoints({ points: [point('2020-01-01', 60, 60), point('2021-01-01', 50, 61), point('2022-01-01', 40, 62), point('2023-01-01', 30, 63)], slopePerYear: -10, intercept: 60, enabled: { ...observed, projectedAgeToCkdG5: true } })
    expect(result.projectedAgeToCkdG5).toMatchObject({ value: null, reason: 'slope_ci_unavailable' })
  })
  it('allows exactly 20 years after the latest endpoint measurement but not beyond', () => {
    const points = [point('2020-01-01', 60, 60), point('2021-01-01', 59, 61), point('2022-01-01', 58, 62), point('2023-01-01', 57, 63)]
    const elapsed = (points[3].date.getTime() - points[0].date.getTime()) / (365.25 * 86400000)
    const base = { points, slopePerYear: -1, slopeCiLow: -2, slopeCiHigh: -0.1, enabled: { ...observed, projectedAgeToCkdG5: true } }
    expect(computeCkdEndpoints({ ...base, intercept: 15 + elapsed + 20 }).projectedAgeToCkdG5.reason).toBeNull()
    expect(computeCkdEndpoints({ ...base, intercept: 15 + elapsed + 20.001 }).projectedAgeToCkdG5.reason).toBe('beyond_projection_horizon')
  })
  it('keeps observed G5, KRT and no-fit reasons ahead of CI gating', () => {
    const enabled = { ...observed, projectedAgeToCkdG5: true }
    const observedPoints = [point('2020-01-01', 14, 60), point('2020-05-01', 13, 60.3), point('2021-01-01', 12, 61)]
    expect(computeCkdEndpoints({ points: observedPoints, slopePerYear: -2, intercept: 14, enabled }).projectedAgeToCkdG5.reason).toBe('observed_ckd_g5')
    const points = [point('2020-01-01', 60, 60), point('2021-01-01', 50, 61), point('2022-01-01', 40, 62), point('2023-01-01', 30, 63)]
    expect(computeCkdEndpoints({ points, slopePerYear: -10, intercept: 60, enabled, kidneyFailureReached: { type: 'kidney_transplant', date: d('2023-01-01') } }).projectedAgeToCkdG5.reason).toBe('kidney_failure_reached')
    expect(computeCkdEndpoints({ points, slopePerYear: Number.NaN, intercept: 60, enabled }).projectedAgeToCkdG5.reason).toBe('no_fit')
  })

  describe('KDIGO minimum for the extrapolation: four dates over three years (decided 2026-11-22)', () => {
    const enabled = { ...observed, projectedAgeToCkdG5: true }
    const fit = { slopePerYear: -10, intercept: 60, slopeCiLow: -12, slopeCiHigh: -8 }
    it('withholds three dates over three years and four dates one day short of three calendar years', () => {
      const three = [point('2020-01-01', 60, 60), point('2021-06-01', 45, 61), point('2023-01-01', 30, 63)]
      expect(computeCkdEndpoints({ points: three, ...fit, enabled }).projectedAgeToCkdG5).toMatchObject({ value: null, reason: 'kdigo_minimum_follow_up' })
      const short = [point('2020-01-01', 60, 60), point('2021-01-01', 50, 61), point('2022-01-01', 40, 62), point('2022-12-31', 30, 62)]
      expect(computeCkdEndpoints({ points: short, ...fit, enabled }).projectedAgeToCkdG5).toMatchObject({ value: null, reason: 'kdigo_minimum_follow_up' })
    })
    it('reports four dates over exactly three calendar years', () => {
      const exact = [point('2020-01-01', 60, 60), point('2021-01-01', 50, 61), point('2022-01-01', 40, 62), point('2023-01-01', 30, 63)]
      // t = (15 - 60) / -10 = 4.5 years; span 1096 days = 3.0007 years; 63 + 1.4993.
      const result = computeCkdEndpoints({ points: exact, ...fit, enabled })
      expect(result.projectedAgeToCkdG5.reason).toBeNull()
      expect(result.projectedAgeToCkdG5.value).toBeCloseTo(63 + 4.5 - 1096 / 365.25, 6)
    })
    it('keeps the older gates first: two dates and a span under 365 days', () => {
      expect(computeCkdEndpoints({ points: [point('2020-01-01', 60, 60), point('2024-01-01', 30, 64)], ...fit, enabled }).projectedAgeToCkdG5.reason).toBe('insufficient_points')
      const shortSpan = [point('2020-01-01', 60, 60), point('2020-04-01', 50, 60), point('2020-07-01', 40, 60), point('2020-10-01', 30, 60)]
      expect(computeCkdEndpoints({ points: shortSpan, ...fit, enabled }).projectedAgeToCkdG5.reason).toBe('span_too_short')
    })
  })

  describe('single value below 15, unconfirmed (decided 2026-11-22)', () => {
    const g5 = { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: false }
    it('is never an observed G5 and is flagged', () => {
      const result = computeCkdEndpoints({ points: [point('2020-01-01', 20), point('2020-06-01', 12), point('2020-09-01', 19)], slopePerYear: -1, enabled: g5 })
      expect(result.observedCkdG5.met).toBe(false)
      expect(result.g5SingleUnconfirmed).toBe(true)
    })
    it('flags a last value below 15 and not two neighbouring low dates', () => {
      expect(computeCkdEndpoints({ points: [point('2020-01-01', 20), point('2020-06-01', 12)], slopePerYear: -1, enabled: g5 }).g5SingleUnconfirmed).toBe(true)
      expect(computeCkdEndpoints({ points: [point('2020-01-01', 20), point('2020-06-01', 12), point('2020-07-01', 13)], slopePerYear: -1, enabled: g5 }).g5SingleUnconfirmed).toBe(false)
    })
    it('counts a date with a value of 15 or more as not low', () => {
      expect(computeCkdEndpoints({ points: [point('2020-01-01', 20), point('2020-06-01', 12), point('2020-06-01', 16)], slopePerYear: -1, enabled: g5 }).g5SingleUnconfirmed).toBe(false)
    })
    it('is not set with a confirmed G5, and is null without G5 or projection', () => {
      const points = [point('2019-01-01', 12), point('2019-02-01', 20), point('2020-01-01', 14), point('2020-05-01', 13)]
      expect(computeCkdEndpoints({ points, slopePerYear: -1, enabled: g5 }).g5SingleUnconfirmed).toBe(false)
      expect(computeCkdEndpoints({ points, slopePerYear: -1, enabled: { ...g5, observedCkdG5: false } }).g5SingleUnconfirmed).toBeNull()
    })
    it('does not withhold the extrapolation', () => {
      // 40, 35, 12 (single, AKI), 30, 25 on 1 January 2020 to 2024: the projection is computed from the given fit.
      const points = [point('2020-01-01', 40, 60), point('2021-01-01', 35, 61), point('2022-01-01', 12, 62), point('2023-01-01', 30, 63), point('2024-01-01', 25, 64)]
      const result = computeCkdEndpoints({ points, slopePerYear: -4, intercept: 40, slopeCiLow: -6, slopeCiHigh: -2, enabled: { ...g5, projectedAgeToCkdG5: true } })
      expect(result.g5SingleUnconfirmed).toBe(true)
      expect(result.projectedAgeToCkdG5.reason).toBeNull()
      expect(result.projectedAgeToCkdG5.value).toBeCloseTo(64 + (40 - 15) / 4 - 1461 / 365.25, 6)
    })
  })

  it('evaluates the confirmed 50 % decline by the rule of 40 % and 57 %, only when switched on', () => {
    // Baseline 100; 52 (48 %) and 49 (51 %) are 40 % declines, only 49 and 48 are 50 % declines.
    const points = [point('2020-01-01', 100), point('2020-06-01', 52), point('2020-09-01', 49), point('2021-01-01', 48)]
    const on = computeCkdEndpoints({ points, slopePerYear: -1, enabled: { percentDecline: true, observedCkdG5: false, projectedAgeToCkdG5: false, observedDecline50: true } })
    expect(on.observedDecline40).toMatchObject({ met: true, firstValue: 52, confirmedValue: 49 })
    expect(on.observedDecline50).toMatchObject({ met: true, firstValue: 49, confirmedValue: 48 })
    expect(on.observedDecline57.met).toBe(false)
    expect(on.evaluated.observedDecline50).toBe(true)
    const off = computeCkdEndpoints({ points, slopePerYear: -1, enabled: { percentDecline: true, observedCkdG5: false, projectedAgeToCkdG5: false } })
    expect(off.observedDecline50.met).toBe(false)
    expect(off.evaluated.observedDecline50).toBe(false)
    // Without percent decline there is no baseline, so no 50 % decline either.
    expect(computeCkdEndpoints({ points, slopePerYear: -1, enabled: { percentDecline: false, observedCkdG5: false, projectedAgeToCkdG5: false, observedDecline50: true } }).evaluated.observedDecline50).toBe(false)
  })

  describe('conclusive bounds with the single value below 15 and the 50 % decline (merge of #73 and #82)', () => {
    const bound = (date: string, operator: '<' | '>', limit: number) => ({ date: d(date), operator, limit })
    // 20, 12 and, 120 days later, 13: a G5 confirmed under the 90-day interval unless a bound clears the candidate.
    const points = [point('2020-01-01', 20), point('2021-01-15', 12), point('2021-05-15', 13)]
    const g5 = { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: false }
    it('lets a conclusive bound clear the G5 candidate and separate the low dates into single values', () => {
      const plain = computeCkdEndpoints({ points, slopePerYear: -1, enabled: g5 })
      expect(plain.observedCkdG5.met).toBe(true)
      expect(plain.g5SingleUnconfirmed).toBe(false)
      const reset = computeCkdEndpoints({ points, bounds: [bound('2021-03-01', '>', 20)], slopePerYear: -1, enabled: g5 })
      expect(reset.observedCkdG5.met).toBe(false)
      expect(reset.g5SingleUnconfirmed).toBe(true)
      // With only the extrapolation on, the same reset decides the confirmed G5 the flag reads.
      expect(computeCkdEndpoints({ points, bounds: [bound('2021-03-01', '>', 20)], slopePerYear: -1, enabled: { ...g5, observedCkdG5: false, projectedAgeToCkdG5: true } }).g5SingleUnconfirmed).toBe(true)
      // `>10` and `<20` prove nothing about 15: no reset, no flag.
      for (const b of [bound('2021-03-01', '>', 10), bound('2021-03-01', '<', 20)]) {
        const ignored = computeCkdEndpoints({ points, bounds: [b], slopePerYear: -1, enabled: g5 })
        expect(ignored.observedCkdG5.met).toBe(true)
        expect(ignored.g5SingleUnconfirmed).toBe(false)
      }
      // A conclusive bound on a low date makes that date not low.
      expect(computeCkdEndpoints({ points: [point('2020-01-01', 20), point('2021-01-15', 12)], bounds: [bound('2021-01-15', '>', 15)], slopePerYear: -1, enabled: g5 }).g5SingleUnconfirmed).toBe(false)
    })
    it('does not let a bound interrupt a 40 % or 50 % decline candidate (OD-62)', () => {
      // Baseline 100; 48 and, 122 days later, 45 are 52 % and 55 % declines; `>60` between them proves a decline below 40 %.
      const decline = [point('2020-01-01', 100), point('2020-06-01', 48), point('2020-10-01', 45)]
      const result = computeCkdEndpoints({ points: decline, bounds: [bound('2020-08-01', '>', 60)], slopePerYear: -1,
        enabled: { percentDecline: true, observedCkdG4: true, observedCkdG5: true, projectedAgeToCkdG5: false, observedDecline50: true } })
      for (const event of [result.observedDecline40, result.observedDecline50]) {
        expect(event).toMatchObject({ met: true, firstDate: d('2020-06-01'), confirmedDate: d('2020-10-01'), firstValue: 48, confirmedValue: 45 })
      }
      expect(result.observedDecline57.met).toBe(false)
      expect(result.observedCkdG4.met).toBe(false)
      expect(result.g5SingleUnconfirmed).toBe(false)
    })
  })
})
