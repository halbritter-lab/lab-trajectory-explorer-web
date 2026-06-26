import { describe, expect, it } from 'vitest'
import { fitOls } from '../../../src/core/stats/ols'
import { mixedModelRowsFromCohortInputs } from '../../../src/core/mixedModel/cohortDataset'
import type { CohortSeriesSpec } from '../../../src/core/cohort/screening'
import type { ClinicalEvent } from '../../../src/core/events/events'
import { generalExplorationConfig } from '../../../src/core/fitPipeline/types'
import type { LabRow } from '../../../src/core/types'

const unit = 'ml/min/1.73m2'
const d = (s: string) => new Date(s)

function row(p: Partial<LabRow>): LabRow {
  return {
    patientId: 'p1',
    labDatum: d('2020-01-01T00:00:00Z'),
    bezeichnung: 'eGFR',
    einheit: unit,
    wert: String(p.wertNum ?? 60),
    wertNum: 60,
    wertOperator: '=',
    loinc: null,
    patientSex: null,
    patientAgeAtLab: null,
    ...p,
  }
}

function eGfrRows(patientId: string, intercept: number, slope: number): LabRow[] {
  return [
    row({ patientId, labDatum: d('2020-01-01T00:00:00Z'), wertNum: intercept }),
    row({ patientId, labDatum: d('2020-01-20T00:00:00Z'), wertNum: intercept + 2 }),
    row({ patientId, labDatum: d('2021-01-01T00:00:00Z'), wertNum: intercept + slope }),
    row({ patientId, labDatum: d('2022-01-01T00:00:00Z'), wertNum: intercept + 2 * slope }),
    row({ patientId, labDatum: d('2023-01-01T00:00:00Z'), wertNum: intercept + 3 * slope }),
    row({ patientId, labDatum: d('2021-06-01T00:00:00Z'), bezeichnung: 'HbA1c', einheit: '%', wertNum: 7 }),
    row({ patientId, labDatum: d('2021-06-01T00:00:00Z'), wertNum: null }),
  ]
}

function transplant(patientId: string): ClinicalEvent {
  return {
    patientId,
    type: 'kidney_transplant',
    date: d('2023-01-01T00:00:00Z'),
    title: 'Kidney transplant',
    description: null,
    endDate: null,
    intent: null,
    warning: '',
  }
}

describe('controlled mixed-model cohort fixture', () => {
  it('turns filtered cohort inputs into model rows with known patient slopes', () => {
    const fitConfig = generalExplorationConfig({ bezeichnung: 'eGFR', einheit: unit })
    fitConfig.timeBalancing = 'monthly-median'
    fitConfig.censoring.censorAfterKidneyTransplant = true
    const spec: CohortSeriesSpec = {
      bezeichnung: 'eGFR',
      einheit: unit,
      mode: 'global',
      fitConfig,
      clinicalEventsByPatient: {
        p4: [transplant('p4')],
      },
    }
    const rows = [
      ...eGfrRows('p1', 72, -1.5),
      ...eGfrRows('p2', 64, -2),
      ...eGfrRows('p3', 58, -2.5),
      ...eGfrRows('p4', 52, -3),
    ]

    const modelRows = mixedModelRowsFromCohortInputs(rows, ['p4', 'p1', 'p2', 'p3'], spec)

    expect(modelRows).toHaveLength(15)
    expect(modelRows.map((r) => r.patient_id)).toEqual([
      'p1', 'p1', 'p1', 'p1',
      'p2', 'p2', 'p2', 'p2',
      'p3', 'p3', 'p3', 'p3',
      'p4', 'p4', 'p4',
    ])
    expect(modelRows.filter((r) => r.patient_id === 'p1')).toEqual([
      { patient_id: 'p1', eGFR: 73, time_since_baseline: 0 },
      { patient_id: 'p1', eGFR: 70.5, time_since_baseline: 1.0020533881 },
      { patient_id: 'p1', eGFR: 69, time_since_baseline: 2.0013689254 },
      { patient_id: 'p1', eGFR: 67.5, time_since_baseline: 3.0006844627 },
    ])
    expect(modelRows.filter((r) => r.patient_id === 'p4').map((r) => r.eGFR)).toEqual([53, 49, 46])

    const slopes = patientSlopes(modelRows)
    expect(slopes).toEqual({
      p1: -1.8,
      p2: -2.3,
      p3: -2.8,
      p4: -3.498,
    })
    expect(mean(Object.values(slopes))).toBe(-2.5995)
  })
})

function patientSlopes(rows: readonly { patient_id: string; eGFR: number; time_since_baseline: number }[]): Record<string, number> {
  const grouped = new Map<string, typeof rows>()
  for (const row of rows) grouped.set(row.patient_id, [...(grouped.get(row.patient_id) ?? []), row])
  return Object.fromEntries(
    [...grouped].map(([patientId, patientRows]) => {
      const fit = fitOls(
        patientRows.map((row) => row.time_since_baseline),
        patientRows.map((row) => row.eGFR),
      )
      return [patientId, Number(fit.slope.toFixed(3))]
    }),
  )
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
