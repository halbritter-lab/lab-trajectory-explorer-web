import { describe, it, expect } from 'vitest'
import { slopeQualityLabel, projectedG5Label, isUnstableSlope } from '../../src/ui/qualityLabels'
import type { SlopeQualityInput } from '../../src/ui/qualityLabels'
import { computeCkdEndpoints, type CkdEndpoints } from '../../src/core/endpoints/ckdEndpoints'

const ALL_ENDPOINTS = { percentDecline: true, observedCkdG5: true, projectedAgeToCkdG5: true }

function q(partial: Partial<SlopeQualityInput>): SlopeQualityInput {
  return { reason: null, nFitted: 10, fittedSpanDays: 1_000, fitModel: 'ols', ...partial }
}

function endpointsFor(points: { date: string; value: number; ageYears?: number }[], slopePerYear: number): CkdEndpoints {
  return computeCkdEndpoints({
    points: points.map((p) => ({ date: new Date(p.date), value: p.value, ageYears: p.ageYears ?? 50 })),
    slopePerYear,
    enabled: ALL_ENDPOINTS,
  })
}

describe('slopeQualityLabel', () => {
  it('labels the reasons that mean no slope was produced', () => {
    expect(slopeQualityLabel(q({ reason: 'n_below_threshold', nFitted: 1 }))?.label).toBe('n < 3')
    expect(slopeQualityLabel(q({ reason: 'no_numeric_values', nFitted: 0 }))?.label).toBe('no values')
  })

  it('does not call fully excluded numeric measurements unparseable', () => {
    const label = slopeQualityLabel(q({ nFitted: 0, fittedSpanDays: 0 }))

    expect(label?.label).toBe('no fit values')
    expect(label?.title).toContain('No usable measurements remain for fitting')
  })

  it('labels a short observation window and leaves a clean fit unflagged', () => {
    expect(slopeQualityLabel(q({ reason: 'span_too_short' }))?.label).toBe('< 1 yr')
    expect(slopeQualityLabel(q({}))).toBeNull()
  })

  it('separates a caveated slope from one that does not exist', () => {
    // span_too_short and a thin fit still produce a slope; the rest do not.
    expect(slopeQualityLabel(q({ reason: 'span_too_short' }))?.caveat).toBe(true)
    expect(slopeQualityLabel(q({ nFitted: 2 }))?.caveat).toBe(true)
    expect(slopeQualityLabel(q({ reason: 'n_below_threshold', nFitted: 1 }))?.caveat).toBe(false)
    expect(slopeQualityLabel(q({ reason: 'no_numeric_values', nFitted: 0 }))?.caveat).toBe(false)
  })

  it('flags a two-point fit, which the reason field reports as clean', () => {
    // fitGlobal special-cases n === 2: exact slope, r2 = 1, reason null. Over a
    // span longer than a year nothing in `reason` marks it.
    expect(slopeQualityLabel(q({ nFitted: 2 }))?.label).toBe('n < 3')
    expect(slopeQualityLabel(q({ nFitted: 3 }))).toBeNull()
  })

  it('counts fitted points, not raw measurements', () => {
    // Quarterly-median balancing (the CKD-progression default) collapses eight
    // raw values into two fitted ones. Counting the raw eight would miss the
    // exact case this rule exists to catch.
    expect(slopeQualityLabel(q({ nFitted: 2 }))?.label).toBe('n < 3')
    expect(slopeQualityLabel(q({ nFitted: 2 }))?.title).toContain('only 2 points')
  })

  it('flags a short fitted span even when the reference reason uses the long raw span', () => {
    expect(slopeQualityLabel(q({ nFitted: 3, fittedSpanDays: 60 }))?.label).toBe('< 1 yr')
    expect(isUnstableSlope(q({ nFitted: 3, fittedSpanDays: 60 }))).toBe(true)
  })

  it('says nothing when no fit was requested', () => {
    // The "Acute review" preset sets fitModel 'none', for which summarize emits
    // reason 'n_below_threshold' regardless of how many points exist. Reading
    // reason alone would claim "fewer than three" for a series with ten.
    expect(slopeQualityLabel(q({ reason: 'n_below_threshold', fitModel: 'none' }))).toBeNull()
    expect(isUnstableSlope(q({ reason: 'n_below_threshold', fitModel: 'none' }))).toBe(false)
  })

  it('isUnstableSlope agrees with the label for every case', () => {
    const cases: Partial<SlopeQualityInput>[] = [
      {}, { nFitted: 0 }, { nFitted: 2 }, { nFitted: 3 },
      { reason: 'span_too_short' }, { reason: 'n_below_threshold', nFitted: 1 },
      { reason: 'no_numeric_values', nFitted: 0 }, { fitModel: 'none' },
      { reason: 'n_below_threshold', fitModel: 'none' },
    ]
    for (const c of cases) {
      expect(isUnstableSlope(q(c))).toBe(slopeQualityLabel(q(c)) !== null)
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

  it('labels an unavailable projection when there is no fit at all', () => {
    const endpoints = endpointsFor([
      { date: '2019-01-01', value: 60 },
      { date: '2021-01-01', value: 40 },
      { date: '2024-01-01', value: 20 },
    ], Number.NaN)
    expect(endpoints.projectedAgeToCkdG5.reason).toBe('no_fit')
    expect(projectedG5Label(endpoints)?.label).toBe('G5 no fit')
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
