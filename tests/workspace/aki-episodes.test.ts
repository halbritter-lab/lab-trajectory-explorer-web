import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../src/core/types'
import type { ClinicalEvent } from '../../src/core/events/events'
import { akiEpisodeDialysisLabel, akiEpisodeEndLabel, akiEpisodeExportRows, akiEpisodeRows } from '../../src/workspace/aki-episodes'

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
      end_date: '', dialysis_start: '', ended_by_gap: false, last_value_date: '2022-03-02',
    })
    expect(episodes[1].peakValue).toBeCloseTo(1.6, 6)
  })
  it('leaves out creatinine measured under chronic dialysis, as the detector does', () => {
    const dialysis: ClinicalEvent = { patientId: 'B', type: 'dialysis', intent: 'chronic', date: day('2022-01-01'), endDate: null, title: 'HD', description: null, warning: '' }
    expect(akiEpisodeRows(rows, [dialysis])).toEqual([])
  })

  // Episode end (issue #67) and the first dialysis start within the episode (K29, decided 2026-11-21).
  const icu = [
    row('C', '2026-03-01', 1.0), row('C', '2026-03-02', 1.6), row('C', '2026-03-03', 2.4), row('C', '2026-03-04', 3.1),
    row('C', '2026-03-09', 2.0), row('C', '2026-03-10', 1.4), row('C', '2026-03-11', 1.2),
  ]
  const dialysis = (date: string, intent: ClinicalEvent['intent'], endDate: string | null = null): ClinicalEvent =>
    ({ patientId: 'C', type: 'dialysis', intent, date: day(date), endDate: endDate === null ? null : day(endDate), title: 'CVVHDF', description: null, warning: '' })
  it('gives the end date of the episode and leaves it empty while the episode is open', () => {
    const [episode] = akiEpisodeRows(icu, [])
    expect(episode).toMatchObject({ stage: 3, onset: day('2026-03-02'), endDate: day('2026-03-09'), dialysis: null })
    expect(akiEpisodeExportRows([episode])[0]).toMatchObject({ end_date: '2026-03-09', dialysis_start: '' })
    expect(akiEpisodeEndLabel(episode)).toBe('09/03/2026')
    const [open] = akiEpisodeRows(icu.slice(0, 4), [])
    expect(open.endDate).toBeNull()
    expect(akiEpisodeEndLabel(open)).toBe('open at the last value')
    expect(akiEpisodeExportRows([open])[0].end_date).toBe('')
  })
  it('names the first dialysis that starts between onset and end, with its intent, and keeps the stage', () => {
    // An acute interval 5 to 8 March removes no value and keeps the episode open through it.
    const rows = akiEpisodeRows(icu, [dialysis('2026-03-06', 'unknown'), dialysis('2026-03-05', 'acute', '2026-03-08'), dialysis('2026-03-12', 'chronic')])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ stage: 3, endDate: day('2026-03-09'), dialysis: { start: day('2026-03-05'), intent: 'acute' } })
    expect(akiEpisodeExportRows(rows)[0].dialysis_start).toBe('2026-03-05 (acute)')
    expect(akiEpisodeDialysisLabel(rows[0])).toBe('05/03/2026 (acute)')
  })
  it('counts a dialysis start on the onset or the end date, not one before or after the episode', () => {
    const start = (date: string, intent: ClinicalEvent['intent'] = 'unknown') => akiEpisodeRows(icu, [dialysis(date, intent)])[0].dialysis
    expect(start('2026-03-02')).toEqual({ start: day('2026-03-02'), intent: 'unknown' })
    expect(start('2026-03-09', null)).toEqual({ start: day('2026-03-09'), intent: 'unknown' })
    expect(start('2026-03-01')).toBeNull()
    expect(start('2026-03-10')).toBeNull()
    expect(akiEpisodeDialysisLabel({ dialysis: null })).toBe('none')
  })
  it('counts a dialysis start up to two days after the last value of an episode that is still open', () => {
    // Review 2026-11-22: until this change every later start counted, also one years after the values stop.
    const open = icu.slice(0, 4)
    expect(akiEpisodeRows(open, [dialysis('2027-01-01', 'chronic')])[0].dialysis).toBeNull()
    expect(akiEpisodeRows(open, [dialysis('2026-03-06', 'chronic')])[0].dialysis).toEqual({ start: day('2026-03-06'), intent: 'chronic' })
    expect(akiEpisodeRows(open, [dialysis('2026-03-07', 'chronic')])[0].dialysis).toBeNull()
  })
  it('names the chronic dialysis that follows an episode without recovery', () => {
    // Review 2026-11-22: 1.2 on 3 January would have ended the episode although chronic HD starts the next day.
    const chr = [row('C', '2024-01-01', 1.0), row('C', '2024-01-02', 1.6), row('C', '2024-01-03', 1.2)]
    expect(akiEpisodeRows(chr, [dialysis('2024-01-04', 'chronic')])).toMatchObject([{ endDate: null, dialysis: { start: day('2024-01-04'), intent: 'chronic' } }])
  })
  it('uses the recovery length it is given', () => {
    const twice = [row('C', '2024-01-01', 1.0), row('C', '2024-01-02', 1.6), row('C', '2024-01-03', 1.0), row('C', '2024-01-05', 1.6)]
    expect(akiEpisodeRows(twice, []).map(e => akiEpisodeEndLabel(e))).toEqual(['open at the last value'])
    expect(akiEpisodeRows(twice, [], 24).map(e => akiEpisodeEndLabel(e))).toEqual(['03/01/2024', 'open at the last value'])
    // The dialysis start of an open episode counts up to the recovery length after its last value.
    expect(akiEpisodeRows(twice.slice(0, 2), [dialysis('2024-01-04', 'acute')], 24)[0].dialysis).toBeNull()
    expect(akiEpisodeRows(twice.slice(0, 2), [dialysis('2024-01-04', 'acute')])[0].dialysis).toEqual({ start: day('2024-01-04'), intent: 'acute' })
  })
  it('bounds the dialysis start of an episode ended by a gap at its last value before the gap', () => {
    const gap = [row('C', '2024-01-01', 1.0), row('C', '2024-01-02', 1.6), row('C', '2024-03-01', 1.0)]
    const [episode] = akiEpisodeRows(gap, [dialysis('2024-02-01', 'acute')])
    // Review 2026-11-22: the list showed 01/03/2024, the first value after the gap, as the end while the
    // dialysis column stopped at 4 January. No end was observed; the list names the last value instead.
    expect(episode).toMatchObject({ endDate: null, endedByGap: true, lastValueDate: day('2024-01-02'), dialysis: null })
    expect(akiEpisodeEndLabel(episode)).toBe('not observed: no values for more than 7 days after 02/01/2024')
    expect(akiEpisodeExportRows([episode])[0]).toMatchObject({ end_date: '', dialysis_start: '', ended_by_gap: true, last_value_date: '2024-01-02' })
    expect(akiEpisodeRows(gap, [dialysis('2024-01-04', 'acute')])[0].dialysis).toEqual({ start: day('2024-01-04'), intent: 'acute' })
  })
})
