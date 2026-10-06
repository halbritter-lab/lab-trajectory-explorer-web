import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../src/core/types'
import { summarizeByBezeichnung } from '../../src/core/stats/summarize'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { mixedModelRowsFromCohortInputs } from '../../src/core/mixedModel/cohortDataset'
import { episodesForSeries } from '../../src/core/domains/nephrology/aki/akiAware'
import { measurementFitStatus } from '../../src/workspace/measurement-fit-status'
import { generalExplorationConfig } from '../../src/core/analysis/fitConfig'
import { appendComputedEgfr } from '../../src/core/domains/nephrology/egfr/series'

const date = (value: string) => new Date(`${value}T00:00:00Z`)
const endpointSpec = () => {
  const fitConfig = generalExplorationConfig({ bezeichnung: 'eGFR', einheit: 'mL/min/1.73m2' })
  fitConfig.endpoints.observedCkdG5 = true
  return { bezeichnung: 'eGFR', einheit: 'mL/min/1.73m2', mode: 'global' as const, fitConfig }
}
function row(day: string, value: number, operator: '=' | '<' | '>' = '=', name = 'eGFR', unit = 'mL/min/1.73m2'): LabRow {
  return { patientId: 1, labDatum: date(day), bezeichnung: name, einheit: unit,
    wert: `${operator === '=' ? '' : operator}${value}`, wertNum: value, wertOperator: operator,
    loinc: null, patientSex: null, patientAgeAtLab: null }
}

describe('bounded measurements', () => {
  it('keeps raw counts and same-date exact values while excluding limits from slope and line', () => {
    const rows = [row('2020-01-01', 60), row('2020-01-01', 10, '<'), row('2021-01-01', 50)]
    const summary = summarizeByBezeichnung(rows, 1)[0]
    expect(summary.nNumeric).toBe(3)
    expect(summary.nFitted).toBe(2)
    expect(summary.slope).toBeCloseTo(-10, 1)
    const cell = buildCohortRows(rows, [1], [endpointSpec()])[0].cells[0]
    expect(cell.points).toHaveLength(3)
    expect(cell.excludedIdx).toEqual([1])
    expect(cell.pointExclusionReasons[1]).toContain('censored-value')
    expect(cell.fitLines[0][0].value).toBe(60)
    expect(measurementFitStatus(rows, cell)).toContain('Excluded: censored value (limit, not exact)')
  })

  it('withholds fit and endpoint when only bounds exist', () => {
    const rows = [row('2020-01-01', 14, '<'), row('2020-05-01', 12, '<')]
    const cell = buildCohortRows(rows, [1], [endpointSpec()])[0].cells[0]
    expect(cell.nNumeric).toBe(2)
    expect(cell.nFitted).toBe(0)
    expect(Number.isNaN(cell.slope)).toBe(true)
    expect(cell.fitLines).toEqual([])
    expect(cell.endpoints.observedCkdG5.met).toBe(false)
  })

  it('excludes bounds from endpoint confirmation on an otherwise exact series', () => {
    const rows = [row('2020-01-01', 14), row('2020-05-01', 12, '<'), row('2020-06-01', 25)]
    const cell = buildCohortRows(rows, [1], [endpointSpec()])[0].cells[0]
    expect(cell.endpoints.observedCkdG5.met).toBe(false)
  })

  it('omits bounds from AKI detection and mixed model rows', () => {
    const creatinine = [row('2020-01-01', 1, '=', 'Kreatinin', 'mg/dl'), row('2020-01-02', 2, '>', 'Kreatinin', 'mg/dl')]
    expect(episodesForSeries(creatinine, 1, 'Kreatinin', 'mg/dl')).toEqual([])
    const rows = [row('2020-01-01', 60), row('2020-01-01', 10, '<'), row('2021-01-01', 50)]
    const model = mixedModelRowsFromCohortInputs(rows, [1], { bezeichnung: 'eGFR', einheit: 'mL/min/1.73m2', mode: 'global' })
    expect(model.map(point => point.value)).toEqual([60, 50])
  })

  it('retains a reversed operator on derived eGFR while excluding it downstream', () => {
    const creatinine = [
      { ...row('2020-01-01', 1, '=', 'Kreatinin', 'mg/dl'), patientSex: 'm' as const, patientAgeAtLab: 50 },
      { ...row('2021-01-01', 2, '>', 'Kreatinin', 'mg/dl'), patientSex: 'm' as const, patientAgeAtLab: 51 },
    ]
    const derived = appendComputedEgfr(creatinine).filter(value => value.bezeichnung?.includes('computed'))
    expect(derived.map(value => value.wertOperator)).toEqual(['=', '<'])
    const summary = summarizeByBezeichnung(derived, 1)[0]
    expect(summary.nNumeric).toBe(2)
    expect(summary.nFitted).toBe(1)
    expect(Number.isNaN(summary.slope)).toBe(true)
  })

  it('chooses the AKI source by exact observations when another creatinine series has more bounds', () => {
    const rows = [
      row('2020-01-01', 1, '<', 'Kreatinin', 'mg/dl'),
      row('2020-01-02', 2, '>', 'Kreatinin', 'mg/dl'),
      row('2020-01-03', 3, '<', 'Kreatinin', 'mg/dl'),
      row('2020-01-01', 1, '=', 'Creatinine serum', 'mg/dl'),
      row('2020-01-02', 2, '=', 'Creatinine serum', 'mg/dl'),
    ]
    expect(episodesForSeries(rows, 1, 'eGFR', 'mL/min/1.73m2')).toHaveLength(1)
  })
})
