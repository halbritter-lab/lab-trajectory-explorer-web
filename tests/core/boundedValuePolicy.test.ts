/**
 * Issue #73: how bounded values (`<x`, `>x`) enter individual fits and slope
 * lines (owner decision 2026-11-21), their count and warning, and the
 * downstream rules of 2026-11-22 (endpoints, AKI and mixed models keep
 * excluding them; a conclusive bound only interrupts a G4/G5 candidate).
 */
import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../src/core/types'
import { summarizeByBezeichnung } from '../../src/core/stats/summarize'
import { buildCohortRows, cohortExportRecords, type CohortSeriesSpec } from '../../src/core/cohort/screening'
import { mixedModelRowsFromCohortInputs } from '../../src/core/mixedModel/cohortDataset'
import { generalExplorationConfig } from '../../src/core/analysis/fitConfig'
import { ckdProgressionConfig } from '../../src/core/domains/nephrology/fitConfig'
import { boundedShareWarns, fitValueOf, type BoundedValuePolicy } from '../../src/core/measurements/censored'
import { boundExcludesCrossing, observeThresholdCrossing } from '../../src/core/endpoints/thresholdEndpoints'
import { computeCkdEndpoints } from '../../src/core/domains/nephrology/endpoints/ckdEndpoints'
import { measurementFitStatus } from '../../src/workspace/measurement-fit-status'
import { boundedShareLabel } from '../../src/workspace/labels/qualityLabels'
import { mixedModelRScript } from '../../src/core/mixedModel/rCode'

const date = (value: string) => new Date(`${value}T00:00:00Z`)
const UACR = { bezeichnung: 'Albumin/Kreatinin-Quotient', einheit: 'mg/g' }
const EGFR = { bezeichnung: 'eGFR', einheit: 'mL/min/1.73m2' }
function row(day: string, value: number, operator: '=' | '<' | '>' = '=', series = EGFR, patientId = 1): LabRow {
  return { patientId, labDatum: date(day), bezeichnung: series.bezeichnung, einheit: series.einheit,
    wert: `${operator === '=' ? '' : operator}${value}`, wertNum: value, wertOperator: operator,
    loinc: null, patientSex: null, patientAgeAtLab: null }
}
const spec = (series: { bezeichnung: string; einheit: string }, boundedValues?: BoundedValuePolicy, base = generalExplorationConfig): CohortSeriesSpec => {
  const fitConfig = base(series)
  if (boundedValues) fitConfig.boundedValues = boundedValues
  return { ...series, mode: 'global', fitConfig }
}

// The issue's example: patient 2 of the demo workbook (public/test_labs.xlsx), UACR in mg/g.
const demoUacr = () => [
  row('2022-01-01', 30, '<', UACR, 2), row('2022-07-01', 45, '=', UACR, 2), row('2023-01-01', 120, '=', UACR, 2),
  row('2023-07-01', 300, '>', UACR, 2), row('2024-01-01', 300, '>', UACR, 2),
]

describe('fit value of a row', () => {
  it('follows the policy', () => {
    const lower = row('2020-01-01', 30, '<'), upper = row('2020-01-01', 300, '>'), exact = row('2020-01-01', 7)
    expect([fitValueOf(lower), fitValueOf(upper), fitValueOf(exact)]).toEqual([30, 300, 7])
    expect([fitValueOf(lower, 'half-limit'), fitValueOf(upper, 'half-limit'), fitValueOf(exact, 'half-limit')]).toEqual([15, 300, 7])
    expect([fitValueOf(lower, 'exclude'), fitValueOf(upper, 'exclude'), fitValueOf(exact, 'exclude')]).toEqual([null, null, 7])
  })

  it('warns from 20 % on, compared without rounding', () => {
    expect(boundedShareWarns(1, 5)).toBe(true)
    expect(boundedShareWarns(1, 6)).toBe(false)
    expect(boundedShareWarns(0, 0)).toBe(false)
    expect(boundedShareWarns(3, 5)).toBe(true)
  })
})

describe('the example of issue #73 (demo patient 2, UACR)', () => {
  it('limit: five values, +159 mg/g per year, three bounded', () => {
    const s = summarizeByBezeichnung(demoUacr(), 2)[0]
    expect(s.nFitted).toBe(5)
    expect(s.nBounded).toBe(3)
    expect(s.slope).toBeCloseTo(159.063, 3)
    expect(s.ciLow).toBeCloseTo(56.670, 3)
    expect(s.ciHigh).toBeCloseTo(261.456, 3)
    expect(s.reason).toBeNull()
  })

  it('half limit: <30 at 15, +165 mg/g per year', () => {
    const s = summarizeByBezeichnung(demoUacr(), 2, 'global', { boundedValues: 'half-limit' })[0]
    expect(s.nFitted).toBe(5)
    expect(s.nBounded).toBe(3)
    expect(s.slope).toBeCloseTo(165.057, 3)
  })

  it('exclude: two values, the exact two-point line under OLS and no Theil-Sen slope', () => {
    const ols = summarizeByBezeichnung(demoUacr(), 2, 'global', { boundedValues: 'exclude' })[0]
    expect(ols.nFitted).toBe(2)
    expect(ols.nBounded).toBe(0)
    expect(ols.slope).toBeCloseTo(148.879, 3)
    expect(ols.r2).toBe(1)
    const theilSen = summarizeByBezeichnung(demoUacr(), 2, 'global-robust', { boundedValues: 'exclude' })[0]
    expect(Number.isNaN(theilSen.slope)).toBe(true)
    expect(theilSen.reason).toBe('n_below_threshold')
  })

  it('shows the warning: 60 % bounded', () => {
    const cell = buildCohortRows(demoUacr(), [2], [spec(UACR)])[0].cells[0]
    expect(cell.nBounded).toBe(3)
    expect(cell.boundedValues).toBe('limit')
    expect(cell.excludedIdx).toEqual([])
    expect(cell.fitLines).toHaveLength(1)
    expect(cell.fitLines[0][0].value).toBeCloseTo(0.307, 3)
    const label = boundedShareLabel({ ...cell, timeBalancing: 'raw' })
    expect(label?.label).toBe('60 % bounded')
    expect(label?.title).toContain('3 of 5 fitted points are bounded values')
    expect(boundedShareLabel({ ...cell, boundedValues: 'exclude', nBounded: 0 })).toBeNull()
    expect(boundedShareLabel({ ...cell, fitModel: 'none' })).toBeNull()
  })

  it('exports n_bounded after the eligible values, before the KRT segment and slope tier columns', () => {
    const rows = buildCohortRows(demoUacr(), [2], [spec(UACR)])
    const record = cohortExportRecords(rows)[0]
    expect(record.n_bounded).toBe(3)
    const keys = Object.keys(record)
    expect(keys.slice(keys.indexOf('last_eligible_value'), keys.indexOf('last_eligible_value') + 3)).toEqual(['last_eligible_value', 'n_bounded', 'krt_segment_start'])
  })

  it('names the entering value in the measurement table', () => {
    const rows = demoUacr()
    const half = buildCohortRows(rows, [2], [spec(UACR, 'half-limit')])[0].cells[0]
    const status = measurementFitStatus(rows, half)
    expect(status[0]).toBe('Available before time balancing; bounded value, enters the fit at half its limit (15)')
    expect(status[3]).toBe('Available before time balancing; bounded value, enters the fit at its limit (300)')
    expect(status[1]).toBe('Available before time balancing')
    const excluded = buildCohortRows(rows, [2], [spec(UACR, 'exclude')])[0].cells[0]
    expect(measurementFitStatus(rows, excluded)[0]).toBe('Excluded: censored value (limit, not exact)')
  })
})

describe('bounds under time balancing', () => {
  it('counts a median bin that holds a bound, whichever value is its median', () => {
    // Q1 2020: exact 10, 12 and <5 (median 10, an exact value); Q2: exact 20; Q3: >40 alone.
    const rows = [row('2020-01-10', 10), row('2020-02-10', 12), row('2020-03-10', 5, '<'), row('2020-05-10', 20), row('2020-08-10', 40, '>')]
    const s = summarizeByBezeichnung(rows, 1, 'global', { timeBalancing: 'quarterly-median' })[0]
    expect(s.nFitted).toBe(3)
    expect(s.nBounded).toBe(2)
    expect(boundedShareWarns(s.nBounded, s.nFitted)).toBe(true)
    const excluded = summarizeByBezeichnung(rows, 1, 'global', { timeBalancing: 'quarterly-median', boundedValues: 'exclude' })[0]
    expect(excluded.nFitted).toBe(2)
    expect(excluded.nBounded).toBe(0)
  })

  it('counts bounded points after an exclusion window, not before', () => {
    const rows = [row('2020-01-01', 60), row('2020-06-01', 10, '<'), row('2021-01-01', 50), row('2021-06-01', 45)]
    const s = summarizeByBezeichnung(rows, 1, 'global', { exclusionWindows: () => ({ exclusions: [{ start: date('2020-05-01'), end: date('2020-07-01') }] }) })[0]
    expect(s.nFitted).toBe(3)
    expect(s.nBounded).toBe(0)
  })
})

describe('log trend and before/after comparison follow the policy', () => {
  it('fits ln of the policy value', () => {
    const rows = demoUacr()
    const limit = buildCohortRows(rows, [2], [{ ...spec(UACR), logTrend: true }])[0].cells[0].logTrend!
    const half = buildCohortRows(rows, [2], [{ ...spec(UACR, 'half-limit'), logTrend: true }])[0].cells[0].logTrend!
    const exclude = buildCohortRows(rows, [2], [{ ...spec(UACR, 'exclude'), logTrend: true }])[0].cells[0].logTrend!
    expect(limit.nFitted).toBe(5)
    expect(half.nFitted).toBe(5)
    expect(exclude.nFitted).toBe(2)
    // ln 15 instead of ln 30 at the first date makes the half-limit log slope steeper.
    expect(half.slope).toBeGreaterThan(limit.slope)
    expect(half.fitLines[0][0].value).toBeLessThan(limit.fitLines[0][0].value)
  })

  it('hands bounds to the before/after sides at their policy value', () => {
    const rows = [row('2020-01-01', 30, '<'), row('2020-06-01', 40), row('2021-01-01', 50), row('2022-01-01', 60), row('2022-06-01', 70), row('2023-01-01', 300, '>')]
    const events = [{ patientId: 1, type: 'other' as const, date: date('2021-06-01'), title: 'Anchor', description: '', endDate: null, intent: null, warning: '' as const }]
    const withComparison = (boundedValues: BoundedValuePolicy) => buildCohortRows(rows, [1], [{ ...spec(EGFR, boundedValues), clinicalEvents: events, anchorComparison: { rule: { kind: 'first' }, exclusionDays: 0 } }])[0].cells[0].anchorComparison!
    expect(withComparison('limit').before!.nFitted).toBe(3)
    expect(withComparison('exclude').before!.nFitted).toBe(2)
    expect(withComparison('limit').after!.nFitted).toBe(3)
  })
})

describe('downstream uses keep excluding bounds (decided 2026-11-22)', () => {
  it('leaves bounds out of mixed-model rows under every policy', () => {
    const rows = [row('2020-01-01', 60), row('2020-06-01', 90, '>'), row('2021-01-01', 50)]
    for (const policy of ['limit', 'half-limit'] as const) {
      const model = mixedModelRowsFromCohortInputs(rows, [1], spec(EGFR, policy))
      expect(model.map(point => point.value)).toEqual([60, 50])
    }
  })

  it('keeps bounds out of the decline baseline, total change and projection', () => {
    const rows = [row('2018-01-01', 90, '>'), row('2018-02-01', 50), row('2019-02-01', 40), row('2020-02-01', 30), row('2021-02-01', 20)]
    const cell = buildCohortRows(rows, [1], [spec(EGFR, 'limit', ckdProgressionConfig)])[0].cells[0]
    const endpoints = cell.endpoints
    expect(endpoints.endpointPointCount).toBe(4)
    expect(endpoints.declineBaselineValue).toBe(50)
    expect(endpoints.percentDecline.baselineValue).toBe(50)
    expect(cell.firstEligibleValue).toBe(50)
    // The column's slope does use the bound.
    expect(cell.nBounded).toBe(1)
  })
})

describe('a conclusive bound interrupts an unconfirmed G4/G5 candidate', () => {
  const g4 = { threshold: 30, direction: 'below' as const, confirmationDays: 90, maximumConfirmationMonths: 12 }
  const point = (day: string, value: number) => ({ date: date(day), value, ageYears: null })
  const bound = (day: string, operator: '<' | '>', limit: number) => ({ date: date(day), operator, limit })

  it('decides which bounds prove no crossing', () => {
    expect(boundExcludesCrossing(bound('2020-01-01', '>', 30), g4)).toBe(true)
    expect(boundExcludesCrossing(bound('2020-01-01', '>', 60), g4)).toBe(true)
    expect(boundExcludesCrossing(bound('2020-01-01', '>', 29.5), g4)).toBe(false)
    expect(boundExcludesCrossing(bound('2020-01-01', '<', 60), g4)).toBe(false)
    expect(boundExcludesCrossing(bound('2020-01-01', '<', 10), { threshold: 15, direction: 'above' })).toBe(true)
    expect(boundExcludesCrossing(bound('2020-01-01', '<', 10), { threshold: 40, direction: 'above_or_equal' })).toBe(false)
  })

  it('resets the candidate, and a later crossing starts a new one', () => {
    const points = [point('2020-01-01', 25), point('2020-06-01', 24), point('2020-09-01', 23)]
    expect(observeThresholdCrossing(points, g4).firstDate).toEqual(date('2020-01-01'))
    const reset = observeThresholdCrossing(points, g4, [bound('2020-03-01', '>', 60)])
    // The candidate of 2020-01-01 ends on 2020-03-01; 2020-06-01 starts a new
    // one that 2020-09-01 confirms (92 days later).
    expect(reset.met).toBe(true)
    expect(reset.firstDate).toEqual(date('2020-06-01'))
    expect(reset.confirmedDate).toEqual(date('2020-09-01'))
  })

  it('ignores an inconclusive bound and never starts, confirms or recovers with a bound', () => {
    const points = [point('2020-01-01', 25), point('2020-06-01', 24)]
    expect(observeThresholdCrossing(points, g4, [bound('2020-03-01', '>', 20)]).firstDate).toEqual(date('2020-01-01'))
    expect(observeThresholdCrossing(points, g4, [bound('2020-03-01', '<', 25)]).firstDate).toEqual(date('2020-01-01'))
    expect(observeThresholdCrossing([point('2020-01-01', 25)], g4, [bound('2020-06-01', '<', 20)]).met).toBe(false)
    const after = observeThresholdCrossing([...points, point('2021-01-01', 20)], g4, [bound('2020-08-01', '>', 60)])
    expect(after.met).toBe(true)
    expect(after.recoveryDate).toBeNull()
  })

  it('a bound on the date of a crossing value conflicts with it', () => {
    const points = [point('2020-01-01', 25), point('2020-06-01', 24)]
    const result = observeThresholdCrossing(points, g4, [bound('2020-06-01', '>', 30)])
    expect(result.met).toBe(false)
  })

  it('applies in the cell for G4 and G5, under every policy, with the event rules', () => {
    const rows = [row('2020-01-01', 12), row('2020-03-01', 60, '>'), row('2020-06-01', 11)]
    for (const policy of ['limit', 'exclude'] as const) {
      const cell = buildCohortRows(rows, [1], [spec(EGFR, policy, ckdProgressionConfig)])[0].cells[0]
      const endpoints = cell.endpoints
      expect(endpoints.observedCkdG5.met).toBe(false)
      expect(endpoints.observedCkdG4.met).toBe(false)
    }
    // >20 is conclusive for G5 (< 15) only: G4 is still confirmed from 2020-01-01.
    const partial = buildCohortRows([rows[0], row('2020-03-01', 20, '>'), rows[2]], [1], [spec(EGFR, 'limit', ckdProgressionConfig)])[0].cells[0]
    expect(partial.endpoints.observedCkdG5.met).toBe(false)
    expect(partial.endpoints.observedCkdG4.met).toBe(true)
    expect(partial.endpoints.observedCkdG4.firstDate).toEqual(date('2020-01-01'))
    const withoutBound = buildCohortRows([rows[0], rows[2]], [1], [spec(EGFR, 'limit', ckdProgressionConfig)])[0].cells[0]
    expect(withoutBound.endpoints.observedCkdG5.met).toBe(true)
    // A bound after a kidney transplant is not eligible and resets nothing.
    const transplant = [{ patientId: 1, type: 'kidney_transplant' as const, date: date('2020-02-01'), title: 'Tx', description: '', endDate: null, intent: null, warning: '' as const }]
    const late = [row('2019-01-01', 12), row('2019-06-01', 11), row('2020-03-01', 60, '>')]
    const cell = buildCohortRows(late, [1], [{ ...spec(EGFR, 'limit', ckdProgressionConfig), clinicalEvents: transplant }])[0].cells[0]
    expect(cell.endpoints.observedCkdG5.met).toBe(true)
  })

  it('leaves the decline events to exact values', () => {
    const points = [point('2020-01-01', 50), point('2020-06-01', 25), point('2020-10-01', 24)]
    const enabled = { percentDecline: true, observedCkdG4: true, observedCkdG5: false, projectedAgeToCkdG5: false }
    const result = computeCkdEndpoints({ points, slopePerYear: Number.NaN, enabled, bounds: [bound('2020-08-01', '>', 45)] })
    expect(result.observedCkdG4.met).toBe(false)
    expect(result.observedDecline40.met).toBe(true)
  })
})

describe('R export', () => {
  it('suggests a censored mixed model as a commented sensitivity analysis', () => {
    const lines = mixedModelRScript([])
    const start = lines.findIndex(line => line.includes('Sensitivity analysis'))
    expect(start).toBeGreaterThan(-1)
    const block = lines.slice(start, lines.indexOf('', start))
    expect(block.length).toBeGreaterThan(5)
    expect(block.every(line => line.startsWith('#'))).toBe(true)
    expect(block.join('\n')).toContain('lmec')
  })
})
