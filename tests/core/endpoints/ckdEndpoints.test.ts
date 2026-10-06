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
