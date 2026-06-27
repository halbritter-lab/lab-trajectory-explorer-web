import { describe, expect, it } from 'vitest'
import {
  mixedModelRowsByGroup,
  mixedModelRowsFromCohortInputs,
} from '../../../src/core/mixedModel/cohortDataset'
import type { CohortSeriesSpec } from '../../../src/core/cohort/screening'
import type { PatientGroup } from '../../../src/core/grouping/grouping'
import type { LabRow } from '../../../src/core/types'

const d = (s: string) => new Date(s)

function row(p: Partial<LabRow>): LabRow {
  return {
    patientId: 7,
    labDatum: d('2020-01-01T00:00:00Z'),
    bezeichnung: 'eGFR',
    einheit: 'ml/min/1.73m2',
    wert: '60',
    wertNum: 60,
    wertOperator: '=',
    loinc: null,
    patientSex: null,
    patientAgeAtLab: null,
    ...p,
  }
}

const spec: CohortSeriesSpec = { bezeichnung: 'eGFR', einheit: 'ml/min/1.73m2', mode: 'global' }

const rows: LabRow[] = [
  row({ patientId: 'p1', labDatum: d('2020-01-01T00:00:00Z'), wertNum: 70 }),
  row({ patientId: 'p1', labDatum: d('2021-01-01T00:00:00Z'), wertNum: 68 }),
  row({ patientId: 'p2', labDatum: d('2020-01-01T00:00:00Z'), wertNum: 60 }),
  row({ patientId: 'p2', labDatum: d('2021-01-01T00:00:00Z'), wertNum: 58 }),
  row({ patientId: 'p3', labDatum: d('2020-01-01T00:00:00Z'), wertNum: 55 }),
  row({ patientId: 'p3', labDatum: d('2021-01-01T00:00:00Z'), wertNum: 53 }),
]

describe('mixedModelRowsByGroup', () => {
  it('partitions model rows by group, keeping group insertion order', () => {
    const groups: PatientGroup[] = [
      { value: 'A', patientIds: ['p1', 'p3'] },
      { value: 'B', patientIds: ['p2'] },
    ]

    const byGroup = mixedModelRowsByGroup(rows, groups, spec)

    expect(Object.keys(byGroup)).toEqual(['A', 'B'])
    expect(byGroup.A.map((r) => r.patient_id)).toEqual(['p1', 'p1', 'p3', 'p3'])
    expect(byGroup.B.map((r) => r.patient_id)).toEqual(['p2', 'p2'])
  })

  it('omits groups that produced no model rows', () => {
    const groups: PatientGroup[] = [
      { value: 'A', patientIds: ['p1'] },
      // p99 has no lab rows -> no model rows -> omitted
      { value: 'B', patientIds: ['p99'] },
    ]

    const byGroup = mixedModelRowsByGroup(rows, groups, spec)

    expect(Object.keys(byGroup)).toEqual(['A'])
  })

  it('matches the per-group single-call output of mixedModelRowsFromCohortInputs', () => {
    const groups: PatientGroup[] = [
      { value: 'A', patientIds: ['p1', 'p3'] },
      { value: 'B', patientIds: ['p2'] },
    ]

    const byGroup = mixedModelRowsByGroup(rows, groups, spec)

    expect(byGroup.A).toEqual(mixedModelRowsFromCohortInputs(rows, ['p1', 'p3'], spec))
    expect(byGroup.B).toEqual(mixedModelRowsFromCohortInputs(rows, ['p2'], spec))
  })

  it('returns an empty record when there are no groups', () => {
    expect(mixedModelRowsByGroup(rows, [], spec)).toEqual({})
  })
})
