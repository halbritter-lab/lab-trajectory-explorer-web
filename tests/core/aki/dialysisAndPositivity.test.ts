import { describe, expect, it } from 'vitest'
import { episodesForSeries, isUnderDialysis, nonPositiveCreatinineCount } from '../../../src/core/domains/nephrology/aki/akiAware'
import { findKdigoAkiEpisodes } from '../../../src/core/domains/nephrology/aki/kdigo'
import { akiModule } from '../../../src/core/domains/nephrology/aki/akiModule'
import type { ClinicalEvent } from '../../../src/core/events/events'
import type { LabRow } from '../../../src/core/types'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const day = (date: Date) => date.toISOString().slice(0, 10)
function row(date: string, value: number, p: Partial<LabRow> = {}): LabRow {
  return { patientId: 1, labDatum: d(date), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: String(value), wertNum: value,
    wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null, ...p }
}
function event(p: Partial<ClinicalEvent>): ClinicalEvent {
  return { patientId: 1, type: 'dialysis', date: d('2020-03-01'), title: 'Event', description: null, endDate: null, intent: 'chronic', warning: '', ...p }
}

// Decisions of 2026-10-07, formerly OD-13 and OD-14.
describe('creatinine of zero or less takes no part in AKI detection', () => {
  it('neither serves as a baseline nor fires a criterion', () => {
    // Before: baseline 0 gave an infinite ratio (stage III) and 0 -> 0.3 fired the absolute criterion.
    expect(findKdigoAkiEpisodes([{ date: d('2020-01-01'), value: 0 }, { date: d('2020-01-02'), value: 0.3 }])).toEqual([])
    expect(findKdigoAkiEpisodes([{ date: d('2020-01-01'), value: -1 }, { date: d('2020-01-03'), value: 2 }])).toEqual([])
  })
  it('still detects the episode among the positive values around it', () => {
    const episodes = findKdigoAkiEpisodes([
      { date: d('2020-01-01'), value: 1.0 }, { date: d('2020-01-02'), value: 0 }, { date: d('2020-01-03'), value: 1.6 },
    ])
    expect(episodes).toMatchObject([{ baselineValue: 1.0, peakValue: 1.6, stage: 1 }])
    expect(day(episodes[0].baselineDate)).toBe('2020-01-01')
  })
  it('counts the affected serum creatinine rows for the Data page', () => {
    expect(nonPositiveCreatinineCount([
      row('2020-01-01', 0), row('2020-01-02', -0.4), row('2020-01-03', 1),
      row('2020-01-04', 0, { wertOperator: '<' }), row('2020-01-05', 0, { bezeichnung: 'Kreatinin im Urin' }),
      row('2020-01-06', 0, { bezeichnung: 'CRP', einheit: 'mg/l' }),
    ])).toBe(2)
  })
})

describe('isUnderDialysis', () => {
  const chronic = event({ intent: 'chronic', date: d('2020-03-01') })
  const transplant = event({ type: 'kidney_transplant', intent: null, date: d('2021-06-01') })
  it('covers chronic dialysis from its start day up to, not including, the next transplant', () => {
    expect(isUnderDialysis(d('2020-02-29'), [chronic, transplant])).toBe(false)
    expect(isUnderDialysis(d('2020-03-01'), [chronic, transplant])).toBe(true)
    expect(isUnderDialysis(d('2021-05-31'), [chronic, transplant])).toBe(true)
    expect(isUnderDialysis(d('2021-06-01'), [chronic, transplant])).toBe(false)
    expect(isUnderDialysis(d('2030-01-01'), [chronic])).toBe(true)
  })
  it('ignores an earlier transplant and an end date on chronic dialysis', () => {
    const earlier = event({ type: 'kidney_transplant', intent: null, date: d('2019-01-01') })
    expect(isUnderDialysis(d('2022-01-01'), [earlier, event({ intent: 'chronic', endDate: d('2020-12-31') })])).toBe(true)
  })
  it('covers a dated acute interval with both boundary days and nothing else', () => {
    const acute = event({ intent: 'acute', date: d('2020-02-01'), endDate: d('2020-02-10') })
    expect([d('2020-01-31'), d('2020-02-01'), d('2020-02-10'), d('2020-02-11')].map((date) => isUnderDialysis(date, [acute]))).toEqual([false, true, true, false])
    expect(isUnderDialysis(d('2020-02-05'), [event({ intent: 'acute', date: d('2020-02-01'), endDate: null })])).toBe(false)
    expect(isUnderDialysis(d('2020-02-05'), [event({ intent: 'unknown', date: d('2020-02-01'), endDate: d('2020-02-10') })])).toBe(false)
    expect(isUnderDialysis(d('2020-02-05'), [event({ type: 'other', intent: null, date: d('2020-02-01'), endDate: d('2020-02-10') })])).toBe(false)
  })
})

describe('AKI detection leaves out creatinine measured under dialysis', () => {
  // Session-to-session swings under chronic dialysis look like AKI.
  const rows = [row('2020-01-01', 1.0), row('2020-01-03', 1.7), row('2020-04-01', 4.0), row('2020-04-02', 8.0), row('2021-07-01', 1.2), row('2021-07-02', 2.0)]
  const chronic = event({ intent: 'chronic', date: d('2020-03-01') })
  const transplant = event({ type: 'kidney_transplant', intent: null, date: d('2021-06-01') })

  it('detects everything without events', () => {
    expect(episodesForSeries(rows, 1, 'Kreatinin', 'mg/dl').map((e) => day(e.date))).toEqual(['2020-01-03', '2020-04-02', '2021-07-02'])
  })
  it('keeps the episode before dialysis, drops those under it and resumes after transplantation', () => {
    expect(episodesForSeries(rows, 1, 'Kreatinin', 'mg/dl', [chronic]).map((e) => day(e.date))).toEqual(['2020-01-03'])
    expect(episodesForSeries(rows, 1, 'Kreatinin', 'mg/dl', [chronic, transplant]).map((e) => day(e.date))).toEqual(['2020-01-03', '2021-07-02'])
  })
  it('does not use a value inside an acute interval as baseline or peak', () => {
    const acuteRows = [row('2020-01-01', 2.0), row('2020-01-02', 1.0), row('2020-01-03', 1.6)]
    expect(episodesForSeries(acuteRows, 1, 'Kreatinin', 'mg/dl').map((e) => day(e.date))).toEqual(['2020-01-03'])
    const acute = event({ intent: 'acute', date: d('2020-01-02'), endDate: d('2020-01-02') })
    expect(episodesForSeries(acuteRows, 1, 'Kreatinin', 'mg/dl', [acute])).toEqual([])
  })
  it('applies the same rule to another series of the patient and to the dataset-level fit inputs', () => {
    const egfr = row('2020-04-02', 20, { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' })
    expect(episodesForSeries([...rows, egfr], 1, 'eGFR', 'ml/min/1,73m²', [chronic]).map((e) => day(e.date))).toEqual(['2020-01-03'])
    const contribution = akiModule.apply({ rows, manualDemographics: {}, patientAttributes: {}, events: [chronic, event({ patientId: 2, intent: 'chronic', date: d('2019-01-01') })] }, akiModule.defaultSettings)
    expect(contribution.fitInputs!.map((input) => input.windows.map((w) => day(w.start)))).toEqual([['2020-01-03']])
  })
})
