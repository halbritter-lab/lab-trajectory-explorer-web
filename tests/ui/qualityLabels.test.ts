import { describe, it, expect } from 'vitest'
import { slopeQualityLabel, isSlopeCaveat, projectedG5Label, isUnstableSlope } from '../../src/ui/qualityLabels'
import { computeCkdEndpoints, type CkdEndpoints } from '../../src/core/endpoints/ckdEndpoints'

const ALL_ENDPOINTS = { percentDecline: true, observedCkdG5: true, projectedAgeToCkdG5: true }

function endpointsFor(points: { date: string; value: number; ageYears?: number }[], slopePerYear: number): CkdEndpoints {
  return computeCkdEndpoints({
    points: points.map((p) => ({ date: new Date(p.date), value: p.value, ageYears: p.ageYears ?? 50 })),
    slopePerYear,
    enabled: ALL_ENDPOINTS,
  })
}

describe('slopeQualityLabel', () => {
  it('labels the two unstable-slope reasons and leaves a clean fit unflagged', () => {
    expect(slopeQualityLabel('n_below_threshold')?.label).toBe('n < 3')
    expect(slopeQualityLabel('span_too_short')?.label).toBe('< 1 yr')
    expect(slopeQualityLabel('no_numeric_values')?.label).toBe('no values')
    expect(slopeQualityLabel(null)).toBeNull()
  })

  it('treats an unknown reason code as nothing to flag', () => {
    // Better to show no badge than to render a raw internal code at the user.
    expect(slopeQualityLabel('something_new')).toBeNull()
  })

  it('separates a caveated slope from one that does not exist', () => {
    // span_too_short still produces a slope; the others produce none.
    expect(isSlopeCaveat('span_too_short')).toBe(true)
    expect(isSlopeCaveat('n_below_threshold')).toBe(false)
    expect(isSlopeCaveat(null)).toBe(false)
  })

  it('flags a two-point slope, which the reason field reports as a clean fit', () => {
    // fitGlobal special-cases n === 2: exact slope, r2 = 1, reason null. Over a
    // span longer than a year nothing in `reason` marks it, so the badge has to
    // come from the count. This is the reviewer's "fewer than three points" rule.
    expect(slopeQualityLabel(null, 2)?.label).toBe('n < 3')
    expect(isSlopeCaveat(null, 2)).toBe(true)
    expect(slopeQualityLabel(null, 3)).toBeNull()
  })

  it('prefers the point-count caveat over the span caveat when both apply', () => {
    expect(slopeQualityLabel('span_too_short', 2)?.label).toBe('n < 3')
    expect(slopeQualityLabel('span_too_short', 5)?.label).toBe('< 1 yr')
  })

  it('reports an empty series as having no values, not as a thin one', () => {
    expect(slopeQualityLabel(null, 0)?.label).toBe('no values')
    expect(isSlopeCaveat(null, 0)).toBe(false)
  })

  it('isUnstableSlope agrees with the label for every case', () => {
    const cases: [string | null, number][] = [
      [null, 0], [null, 2], [null, 3], [null, 10],
      ['span_too_short', 5], ['n_below_threshold', 1], ['no_numeric_values', 0],
    ]
    for (const [reason, n] of cases) {
      expect(isUnstableSlope(reason, n)).toBe(slopeQualityLabel(reason, n) !== null)
    }
  })
})

describe('projectedG5Label', () => {
  it('says G5 is unlikely when the fit is not declining', () => {
    const endpoints = endpointsFor([
      { date: '2020-01-01', value: 60 },
      { date: '2021-06-01', value: 61 },
      { date: '2023-01-01', value: 60 },
    ], 0.2)
    expect(endpoints.projectedAgeToCkdG5.reason).toBe('non_declining_fit')
    expect(projectedG5Label(endpoints)?.label).toBe('G5 unlikely')
  })

  it('distinguishes too-few-points from too-short-a-span', () => {
    const tooFew = endpointsFor([
      { date: '2020-01-01', value: 60 },
      { date: '2023-01-01', value: 30 },
    ], -10)
    expect(projectedG5Label(tooFew)?.label).toBe('G5 n < 3')

    const tooShort = endpointsFor([
      { date: '2023-01-01', value: 60 },
      { date: '2023-04-01', value: 50 },
      { date: '2023-07-01', value: 40 },
    ], -10)
    expect(projectedG5Label(tooShort)?.label).toBe('G5 < 1 yr')
  })

  it('flags a missing age anchor', () => {
    const endpoints = computeCkdEndpoints({
      points: [
        { date: new Date('2020-01-01'), value: 60, ageYears: null },
        { date: new Date('2021-06-01'), value: 45, ageYears: null },
        { date: new Date('2023-01-01'), value: 30, ageYears: null },
      ],
      slopePerYear: -10,
      enabled: ALL_ENDPOINTS,
    })
    expect(projectedG5Label(endpoints)?.label).toBe('G5 no age')
  })

  it('stays silent when a projection exists', () => {
    const endpoints = endpointsFor([
      { date: '2020-01-01', value: 60 },
      { date: '2021-06-01', value: 45 },
      { date: '2023-01-01', value: 30 },
    ], -10)
    expect(endpoints.projectedAgeToCkdG5.value).not.toBeNull()
    expect(projectedG5Label(endpoints)).toBeNull()
  })

  it('stays silent when G5 was already observed, since the date is shown instead', () => {
    const endpoints = endpointsFor([
      { date: '2020-01-01', value: 14 },
      { date: '2020-08-01', value: 12 },
      { date: '2021-06-01', value: 10 },
    ], -5)
    expect(endpoints.observedCkdG5.met).toBe(true)
    expect(projectedG5Label(endpoints)).toBeNull()
  })

  it('stays silent when the endpoint is switched off', () => {
    const endpoints = computeCkdEndpoints({
      points: [{ date: new Date('2020-01-01'), value: 60, ageYears: 50 }],
      slopePerYear: -10,
      enabled: { percentDecline: true, observedCkdG5: true, projectedAgeToCkdG5: false },
    })
    expect(projectedG5Label(endpoints)).toBeNull()
  })
})
