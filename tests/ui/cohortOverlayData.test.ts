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

  it('stamps each point with its group value when a group-by attribute is active', () => {
    const points = cohortOverlayPointsForSeries({
      rows: [
        row({ patientId: 1, labDatum: new Date('2022-01-15T00:00:00Z'), wertNum: 70 }),
        row({ patientId: 1, labDatum: new Date('2022-07-15T00:00:00Z'), wertNum: 65 }),
        row({ patientId: 2, labDatum: new Date('2022-01-15T00:00:00Z'), wertNum: 50 }),
        row({ patientId: 3, labDatum: new Date('2022-01-15T00:00:00Z'), wertNum: 40 }),
      ],
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      patientIds: [1, 2, 3],
      axis: 'age',
      highlightedPatientIds: [],
      groupByAttribute: 'cohort',
      patientAttributes: {
        '1': { cohort: 'A' },
        '2': { cohort: 'B' },
        // patient 3 has no value -> falls into the ungrouped sentinel
      },
    })

    const groupByPatient = new Map(points.map((p) => [p.patientId, p.group]))
    expect(groupByPatient.get(1)).toBe('A')
    expect(groupByPatient.get(2)).toBe('B')
    expect(groupByPatient.get(3)).toBe('(ungrouped)')
  })

  it('leaves group undefined when no group-by attribute is active', () => {
    const points = cohortOverlayPointsForSeries({
      rows: [row({ patientId: 1, wertNum: 70 })],
      bezeichnung: 'eGFR',
      einheit: 'ml/min/1.73m2',
      patientIds: [1],
      axis: 'age',
      highlightedPatientIds: [],
      patientAttributes: { '1': { cohort: 'A' } },
    })

    expect(points).toHaveLength(1)
    expect(points[0].group).toBeUndefined()
    expect('group' in points[0]).toBe(false)
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
