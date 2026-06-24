import { describe, expect, it } from 'vitest'
import { cohortOverlayPointsForSeries, patientIdFromPlotDatum } from '../../src/ui/cohort/cohortOverlayData'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return {
    patientId: 1,
    labDatum: new Date('2022-01-15T00:00:00Z'),
    bezeichnung: 'eGFR',
    einheit: 'ml/min/1.73m2',
    wert: '60',
    wertNum: 60,
    wertOperator: '=',
    loinc: null,
    patientSex: null,
    patientAgeAtLab: 46,
    ...p,
  }
}

describe('cohortOverlayPointsForSeries', () => {
  it('uses continuous patient time for the age axis when source ages are whole years', () => {
    const points = cohortOverlayPointsForSeries({
      rows: [
        row({ labDatum: new Date('2022-01-15T00:00:00Z'), patientAgeAtLab: 46, wertNum: 70 }),
        row({ labDatum: new Date('2022-07-15T00:00:00Z'), patientAgeAtLab: 46, wertNum: 65 }),
        row({ labDatum: new Date('2023-01-15T00:00:00Z'), patientAgeAtLab: 47, wertNum: 60 }),
      ],
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      patientIds: [1],
      axis: 'age',
      highlightedPatientIds: [],
    })

    expect(points.map((p) => Number((p.x as number).toFixed(3)))).toEqual([46, 46.496, 46.999])
  })

  it('resolves Observable Plot line path index arrays to the correct patient', () => {
    const points = [
      { patientId: 2 },
      { patientId: 2 },
      { patientId: 11 },
      { patientId: 11 },
      { patientId: 1 },
    ]

    expect(patientIdFromPlotDatum([4, 0, 1], points)).toBe(1)
    expect(patientIdFromPlotDatum([0, 1], points)).toBe(2)
    expect(patientIdFromPlotDatum(2, points)).toBe(11)
  })
})
