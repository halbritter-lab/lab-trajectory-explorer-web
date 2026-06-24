import { describe, expect, it } from 'vitest'
import type { FitLineSegment, FitPipelineResult, FitPoint } from '../../../src/core/fitPipeline/types'
import { ckdProgressionConfig, generalExplorationConfig, primaryExclusionReason } from '../../../src/core/fitPipeline/types'

const basePoint = {
  date: new Date('2020-01-01T00:00:00Z'),
  value: 1,
  operator: '=' as const,
  included: true,
  exclusionReasons: [],
  sourceRowIndex: 0,
}

describe('fit pipeline types', () => {
  it('builds the CKD progression preset config', () => {
    const config = ckdProgressionConfig({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' })

    expect(config.parameter.bezeichnung).toBe('eGFR')
    expect(config.preset).toBe('ckd_progression')
    expect(config.xAxis).toBe('age')
    expect(config.censoring.censorAfterKidneyTransplant).toBe(true)
    expect(config.censoring.unknownDialysisPolicy).toBe('exclude-dated-interval')
    expect(config.timeBalancing).toBe('quarterly-median')
    expect(config.endpoints.observedCkdG5).toBe(true)
  })

  it('builds the general exploration preset config', () => {
    const config = generalExplorationConfig({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' })

    expect(config.preset).toBe('general_exploration')
    expect(config.censoring.censorAfterKidneyTransplant).toBe(false)
    expect(config.exclusions.excludeAkiWindows).toBe(false)
    expect(config.timeBalancing).toBe('raw')
    expect(config.endpoints.projectedAgeToCkdG5).toBe(false)
  })

  it('returns the primary exclusion reason by clinical precedence', () => {
    expect(primaryExclusionReason(['aki', 'post_kidney_transplant'])).toBe('post_kidney_transplant')
    expect(primaryExclusionReason(['aki', 'unknown_dialysis_interval'])).toBe('unknown_dialysis_interval')
    expect(primaryExclusionReason([])).toBeNull()
  })

  it('type-checks x values by axis and two-point fit lines', () => {
    const calendarPoint: FitPoint = { ...basePoint, xAxis: 'calendar_time', x: new Date('2020-01-01T00:00:00Z') }
    const agePoint: FitPoint = { ...basePoint, xAxis: 'age', x: 52 }
    const baselinePoint: FitPoint = { ...basePoint, xAxis: 'time_since_baseline', x: 1.25 }
    const segment: FitLineSegment = [
      { date: new Date('2020-01-01T00:00:00Z'), value: 1 },
      { date: new Date('2021-01-01T00:00:00Z'), value: 2 },
    ]

    // @ts-expect-error calendar_time points require Date x values.
    const invalidCalendarPoint: FitPoint = { ...basePoint, xAxis: 'calendar_time', x: 52 }
    // @ts-expect-error age points require numeric x values.
    const invalidAgePoint: FitPoint = { ...basePoint, xAxis: 'age', x: new Date('2020-01-01T00:00:00Z') }
    // @ts-expect-error fit line segments require exactly two points.
    const invalidSegment: FitLineSegment = [{ date: new Date('2020-01-01T00:00:00Z'), value: 1 }]
    // @ts-expect-error pipeline fitLines only accepts two-point segments.
    const invalidResult: Pick<FitPipelineResult, 'fitLines'> = { fitLines: [[{ date: new Date('2020-01-01T00:00:00Z'), value: 1 }]] }

    expect([calendarPoint.xAxis, agePoint.xAxis, baselinePoint.xAxis]).toEqual(['calendar_time', 'age', 'time_since_baseline'])
    expect(segment).toHaveLength(2)
    expect([invalidCalendarPoint, invalidAgePoint, invalidSegment, invalidResult]).toHaveLength(4)
  })
})
