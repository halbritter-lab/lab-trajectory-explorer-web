import { describe, expect, it } from 'vitest'
import { computeCkdEndpoints, type EndpointPoint } from '../../../src/core/endpoints/ckdEndpoints'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

function point(date: string, value: number, ageYears?: number): EndpointPoint {
  return { date: d(date), value, ageYears: ageYears ?? null }
}

describe('computeCkdEndpoints', () => {
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

  it('projects age to CKD G5 from the latest included value and negative slope', () => {
    const endpoints = computeCkdEndpoints({
      points: [point('2020-01-01', 45, 60), point('2021-01-01', 35, 61), point('2022-01-01', 25, 62)],
      slopePerYear: -10,
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
})
