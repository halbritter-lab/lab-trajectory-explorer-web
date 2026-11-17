import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../src/core/types'
import type { ClinicalEvent } from '../../src/core/events/events'
import { akiEpisodeExportRows, akiEpisodeRows } from '../../src/workspace/aki-episodes'

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const row = (patientId: string, date: string, value: number, bezeichnung = 'Kreatinin', einheit = 'mg/dl'): LabRow =>
  ({ patientId, labDatum: day(date), bezeichnung, einheit, wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null }) as LabRow

describe('akiEpisodeRows', () => {
  const rows = [
    row('B', '2022-03-01', 1.0), row('B', '2022-03-02', 1.6),
    row('A', '2021-01-01', 1.0), row('A', '2021-01-02', 1.0),
    row('B', '2022-03-01', 88.42, 'Kreatinin', 'µmol/l'), row('B', '2022-03-02', 141.472, 'Kreatinin', 'µmol/l'),
    row('B', '2022-03-01', 60, 'eGFR', 'ml/min/1.73m²'), row('B', '2022-03-02', 20, 'eGFR', 'ml/min/1.73m²'),
  ]
  it('lists each episode once per serum creatinine series, with onset, peak and baseline in mg/dl', () => {
    const episodes = akiEpisodeRows(rows, [])
    expect(episodes.map(e => [e.patientId, e.unit, e.stage])).toEqual([['B', 'mg/dl', 1], ['B', 'µmol/l', 1]])
    expect(akiEpisodeExportRows(episodes)[0]).toEqual({
      PatientID: 'B', creatinine_parameter: 'Kreatinin', creatinine_unit: 'mg/dl', stage: 1,
      onset_date: '2022-03-02', peak_date: '2022-03-02', peak_value_mg_dl: 1.6,
      baseline_date: '2022-03-01', baseline_value_mg_dl: 1, criterion: 'absolute_0_3_mg_dl_48h',
    })
    expect(episodes[1].peakValue).toBeCloseTo(1.6, 6)
  })
  it('leaves out creatinine measured under chronic dialysis, as the detector does', () => {
    const dialysis: ClinicalEvent = { patientId: 'B', type: 'dialysis', intent: 'chronic', date: day('2022-01-01'), endDate: null, title: 'HD', description: null, warning: '' }
    expect(akiEpisodeRows(rows, [dialysis])).toEqual([])
  })
})
