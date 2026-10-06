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
    const points = [60, 50, 25].map((value, i) => ({ date: new Date(d('2020-01-01').getTime() + i*365.25*86400000), value, ageYears: 60+i }))
    const result = computeCkdEndpoints({ points, slopePerYear: -17.5, intercept: 62.5, enabled: { ...observed, projectedAgeToCkdG5: true } })
    expect(result.projectedAgeToCkdG5.value).toBeCloseTo(62 + 0.7142857143)
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
      points: [point('2020-01-01', 45, 60), point('2021-01-01', 35, 61), point('2022-01-01', 25, 62)],
      slopePerYear: -10,
      intercept: 45,
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
      points: [point('2020-01-01', 60, 60), point('2021-06-01', 40, 61.5), point('2023-01-01', 20, 63)],
      slopePerYear: Number.NaN,
      enabled: { percentDecline: false, observedCkdG5: true, projectedAgeToCkdG5: true },
    })

    expect(endpoints.projectedAgeToCkdG5.reason).toBe('no_fit')
  })
})
