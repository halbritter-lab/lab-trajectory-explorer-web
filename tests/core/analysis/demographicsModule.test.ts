import { describe, it, expect } from 'vitest'
import { demographicsModule } from '../../../src/core/analysis/demographicsModule'
import type { LabRow } from '../../../src/core/types'

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function row(date: string, age: number): LabRow {
  return {
    patientId: 1,
    labDatum: utc(date),
    bezeichnung: 'Kreatinin',
    einheit: 'mg/dl',
    wert: '1,0',
    wertNum: 1,
    wertOperator: '=',
    loinc: null,
    patientSex: 'w',
    patientAgeAtLab: age,
  }
}

describe('demographicsModule', () => {
  it('turns conflicts into warning messages naming the patient', () => {
    const contribution = demographicsModule.apply({
      rows: [row('2022-01-15', 46), row('2022-07-20', 46), row('2023-03-02', 64)],
      manualDemographics: {},
      patientAttributes: {},
      events: [],
    })
    expect(contribution.messages).toHaveLength(1)
    expect(contribution.messages![0].severity).toBe('warning')
    expect(contribution.messages![0].text).toContain('Patient 1')
    expect(contribution.messages![0].text).toContain('no single birth date')
    expect(contribution.rows![2].patientAgeAtLab).toBe(47)
  })

  it('stays silent and passes rows through for consistent data', () => {
    const rows = [row('2022-01-15', 46), row('2022-07-20', 46)]
    const contribution = demographicsModule.apply({
      rows,
      manualDemographics: {},
      patientAttributes: {},
      events: [],
    })
    expect(contribution.rows).toBe(rows)
    expect(contribution.messages).toEqual([])
  })
})
