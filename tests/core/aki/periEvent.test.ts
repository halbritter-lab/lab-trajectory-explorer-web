import { describe, expect, it } from 'vitest'
import { parsePeriEventSettings, periEventCreatinine, periEventCreatinineRows, type PeriEventSettings } from '../../../src/core/domains/nephrology/aki/periEvent'
import type { ClinicalEvent } from '../../../src/core/events/events'
import type { LabRow, WertOperator } from '../../../src/core/types'

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const row = (date: string, value: number, extra: Partial<LabRow> = {}): LabRow => ({
  patientId: 'P', labDatum: day(date), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: String(value), wertNum: value,
  wertOperator: '=' as WertOperator, loinc: null, patientSex: null, patientAgeAtLab: null, ...extra,
})
const event = (date: string, title = 'Contrast CT', type: ClinicalEvent['type'] = 'other', extra: Partial<ClinicalEvent> = {}): ClinicalEvent =>
  ({ patientId: 'P', type, date: day(date), title, description: null, endDate: null, intent: null, warning: '', ...extra } as ClinicalEvent)
const settings = (windowHours: 48 | 72 = 48, title = 'Contrast CT'): PeriEventSettings => ({ rule: { kind: 'title', value: title }, windowHours })
const one = (rows: LabRow[], events: ClinicalEvent[], s = settings()) => periEventCreatinine(rows, events, s)[0]

describe('peri-event creatinine: criterion and boundaries', () => {
  it('meets the absolute criterion at exactly 0.3 mg/dl and not below it', () => {
    const met = one([row('2026-03-01', 1.1), row('2026-03-03', 1.4)], [event('2026-03-01')])
    expect(met).toMatchObject({ status: 'met', criterion: 'absolute_0_3_mg_dl', baselineValue: 1.1, peakValue: 1.4, reason: null })
    expect(met.absoluteRise).toBeCloseTo(0.3, 12)
    expect(one([row('2026-03-01', 1.1), row('2026-03-03', 1.399999)], [event('2026-03-01')]).status).toBe('not_met')
  })
  it('meets the relative criterion at exactly 1.5 times the baseline', () => {
    const r = one([row('2026-03-01', 0.4), row('2026-03-02', 0.6)], [event('2026-03-01')])
    expect(r).toMatchObject({ status: 'met', criterion: 'relative_1_5x' })
    expect(r.ratioToBaseline).toBeCloseTo(1.5, 12)
    expect(one([row('2026-03-01', 0.4), row('2026-03-02', 0.59)], [event('2026-03-01')]).status).toBe('not_met')
    expect(one([row('2026-03-01', 1.0), row('2026-03-02', 1.6)], [event('2026-03-01')]).criterion).toBe('both')
  })
  it('counts the window in calendar days: 48 hours are event day + 1 and + 2, 72 hours add + 3', () => {
    const rows = [row('2026-03-01', 1.0), row('2026-03-04', 2.0)]
    expect(one(rows, [event('2026-03-01')])).toMatchObject({ status: 'not_evaluable', reason: 'no_value_in_window', peakValue: null, windowEnd: day('2026-03-03') })
    expect(one(rows, [event('2026-03-01')], settings(72))).toMatchObject({ status: 'met', peakDate: day('2026-03-04'), windowEnd: day('2026-03-04') })
    // Day + 2 is the last day of the 48-hour window.
    expect(one([row('2026-03-01', 1.0), row('2026-03-03', 2.0)], [event('2026-03-01')]).status).toBe('met')
  })
  it('takes a value on the event day as baseline, not as the peak, even when it carries a time of day', () => {
    const r = one([row('2026-02-20', 0.8), row('2026-03-01', 1.0, { labTime: 20 * 3_600_000 }), row('2026-03-02', 1.2)], [event('2026-03-01')])
    expect(r).toMatchObject({ baselineValue: 1.0, baselineDate: day('2026-03-01'), baselineDaysBefore: 0, peakValue: 1.2, status: 'not_met' })
  })
  it('uses the last value before the event however old, and reports its distance', () => {
    expect(one([row('2024-03-01', 1.0), row('2026-03-02', 1.4)], [event('2026-03-01')])).toMatchObject({ baselineDaysBefore: 730, status: 'met' })
  })
  it('chooses among several baseline-day values: the latest when every value has a time, otherwise the lowest', () => {
    const timed = one([row('2026-03-01', 1.0, { labTime: 6 * 3_600_000 }), row('2026-03-01', 1.2, { labTime: 18 * 3_600_000 }), row('2026-03-02', 1.45)], [event('2026-03-01')])
    expect(timed).toMatchObject({ baselineValue: 1.2, baselineDayValues: 2, status: 'not_met' })
    const untimed = one([row('2026-03-01', 1.2), row('2026-03-01', 1.0, { labTime: 6 * 3_600_000 }), row('2026-03-02', 1.45)], [event('2026-03-01')])
    expect(untimed).toMatchObject({ baselineValue: 1.0, baselineDayValues: 2, status: 'met' })
  })
  it('takes the highest value of the window, the earliest on a tie', () => {
    expect(one([row('2026-03-01', 1.0), row('2026-03-02', 1.5), row('2026-03-03', 1.5)], [event('2026-03-01')])).toMatchObject({ peakValue: 1.5, peakDate: day('2026-03-02'), windowValues: 2 })
  })
})

describe('peri-event creatinine: input series', () => {
  it('converts µmol/l with 88.42', () => {
    const r = one([row('2026-03-01', 97.262, { einheit: 'µmol/l' }), row('2026-03-02', 123.788, { einheit: 'umol/L' })], [event('2026-03-01')])
    // Two units are two series; the first series met wins the tie, so only one value is used.
    expect(r.unit).toBe('µmol/l')
    const same = one([row('2026-03-01', 97.262, { einheit: 'µmol/l' }), row('2026-03-02', 123.788, { einheit: 'µmol/l' })], [event('2026-03-01')])
    expect(same.baselineValue).toBeCloseTo(1.1, 9)
    expect(same.peakValue).toBeCloseTo(1.4, 9)
    expect(same.status).toBe('met')
  })
  it('uses the serum creatinine series with the most exact dated rows, never non-serum material or bounds', () => {
    const rows = [row('2026-03-01', 1.0), row('2026-03-02', 1.1), row('2026-03-01', 0.5, { bezeichnung: 'Kreatinin i.S.' }), row('2026-03-02', 2.0, { bezeichnung: 'Kreatinin i.S.' }),
      row('2026-02-01', 5, { bezeichnung: 'Kreatinin i.S.', wertOperator: '<' }), row('2026-02-02', 5, { bezeichnung: 'Kreatinin i.S.', wertOperator: '<' })]
    expect(one(rows, [event('2026-03-01')])).toMatchObject({ parameter: 'Kreatinin', status: 'not_met' })
    expect(one([row('2026-03-01', 1.0, { bezeichnung: 'Kreatinin i.U.' }), row('2026-03-02', 3.0, { bezeichnung: 'Kreatinin i.U.' })], [event('2026-03-01')]))
      .toMatchObject({ status: 'not_evaluable', reason: 'no_creatinine', parameter: null })
  })
  it('ignores values of zero or less, so the baseline is never 0', () => {
    expect(one([row('2026-02-28', 1.0), row('2026-03-01', 0), row('2026-03-02', 1.2)], [event('2026-03-01')])).toMatchObject({ baselineValue: 1.0, baselineDate: day('2026-02-28'), status: 'not_met' })
    expect(one([row('2026-03-01', 0), row('2026-03-02', 0.3)], [event('2026-03-01')])).toMatchObject({ status: 'not_evaluable', reason: 'no_baseline' })
  })
  it('is not evaluable without a baseline, keeping the peak it found', () => {
    expect(one([row('2026-03-02', 1.4)], [event('2026-03-01')])).toMatchObject({ status: 'not_evaluable', reason: 'no_baseline', peakValue: 1.4, absoluteRise: null })
    expect(one([], [event('2026-03-01')])).toMatchObject({ status: 'not_evaluable', reason: 'no_creatinine' })
  })
})

describe('peri-event creatinine: dialysis and several events', () => {
  it('is not evaluable when the event day is under dialysis', () => {
    const chronic = event('2025-01-01', 'Dialysis start', 'dialysis', { intent: 'chronic' })
    expect(one([row('2026-03-01', 1.0), row('2026-03-02', 2.0)], [chronic, event('2026-03-01')])).toMatchObject({ status: 'not_evaluable', reason: 'event_under_dialysis' })
  })
  it('leaves out window values under dialysis, counts them and names a dialysis start in the window', () => {
    const acute = event('2026-03-02', 'Acute dialysis', 'dialysis', { intent: 'acute', endDate: day('2026-03-02') })
    const r = one([row('2026-03-01', 1.0), row('2026-03-02', 3.0), row('2026-03-03', 1.1)], [event('2026-03-01'), acute])
    expect(r).toMatchObject({ peakValue: 1.1, windowValues: 1, windowValuesUnderDialysis: 1, status: 'not_met', dialysisStartInWindow: { date: day('2026-03-02'), intent: 'acute' } })
    const unknown = event('2026-03-03', 'Dialysis', 'dialysis', { intent: 'unknown' })
    expect(one([row('2026-03-01', 1.0), row('2026-03-03', 1.1)], [event('2026-03-01'), unknown])).toMatchObject({ windowValuesUnderDialysis: 0, dialysisStartInWindow: { intent: 'unknown' } })
    expect(one([row('2026-03-01', 1.0), row('2026-03-03', 1.1)], [event('2026-03-01'), event('2026-03-04', 'Dialysis', 'dialysis', { intent: 'acute' })]).dialysisStartInWindow).toBeNull()
  })
  it('evaluates each selected event on its own and counts the overlapping ones', () => {
    const events = [event('2026-03-03'), event('2026-03-04', 'Cardiac catheterisation'), event('2026-03-10')]
    const rows = [row('2026-03-01', 0.9), row('2026-03-03', 1.0), row('2026-03-04', 1.2), row('2026-03-05', 1.35), row('2026-03-06', 1.6)]
    const all = periEventCreatinine(rows, events, { rule: { kind: 'type', value: 'other' }, windowHours: 48 })
    expect(all.map(r => [r.event.title, r.baselineValue, r.peakValue, r.status, r.overlappingEvents])).toEqual([
      ['Contrast CT', 1.0, 1.35, 'met', 1],
      ['Cardiac catheterisation', 1.2, 1.6, 'met', 1],
      ['Contrast CT', 1.6, null, 'not_evaluable', 0],
    ])
    expect(periEventCreatinine(rows, [event('2026-03-03'), event('2026-03-03')], settings()).map(r => r.overlappingEvents)).toEqual([1, 1])
    // The worked example of the method reference gives the same rows in µmol/l.
    const umol = rows.map(r => ({ ...r, einheit: 'µmol/l', wertNum: r.wertNum! * 88.42 }))
    expect(periEventCreatinine(umol, events, { rule: { kind: 'type', value: 'other' }, windowHours: 48 }).map(r => [r.status, r.criterion])).toEqual(all.map(r => [r.status, r.criterion]))
    const wide = periEventCreatinine(rows, events, { rule: { kind: 'type', value: 'other' }, windowHours: 72 })
    expect(wide.map(r => [r.peakValue, r.criterion, r.windowEnd])).toEqual([[1.6, 'both', day('2026-03-06')], [1.6, 'absolute_0_3_mg_dl', day('2026-03-07')], [null, null, day('2026-03-13')]])
  })
})

describe('peri-event creatinine: event selection, order and settings', () => {
  it('matches title and type exactly and lists all patients in order', () => {
    const rows = [row('2026-03-01', 1.0, { patientId: 10 }), row('2026-03-01', 1.0, { patientId: 2 })]
    const events = [event('2026-03-01', 'Contrast CT', 'other', { patientId: 10 }), event('2026-03-01', 'contrast ct', 'other', { patientId: 3 }), event('2026-03-01', 'Contrast CT', 'other', { patientId: 2 }), event('2026-03-01', 'Contrast CT', 'other', { patientId: 'X' })]
    expect(periEventCreatinineRows(rows, events, settings()).map(r => [r.patientId, r.reason])).toEqual([[2, 'no_value_in_window'], [10, 'no_value_in_window'], ['X', 'no_creatinine']])
    expect(periEventCreatinineRows(rows, events, { rule: { kind: 'type', value: 'dialysis' }, windowHours: 48 })).toEqual([])
  })
  it('reads only valid stored settings', () => {
    expect(parsePeriEventSettings({ rule: { kind: 'type', value: 'other' }, windowHours: 72 })).toEqual({ rule: { kind: 'type', value: 'other' }, windowHours: 72 })
    expect(parsePeriEventSettings({ rule: { kind: 'first' }, windowHours: 48 })).toBeNull()
    expect(parsePeriEventSettings({ rule: { kind: 'title', value: 'A' }, windowHours: 24 })).toBeNull()
    expect(parsePeriEventSettings({ rule: { kind: 'type', value: 3 }, windowHours: 48 })).toBeNull()
    expect(parsePeriEventSettings(null)).toBeNull()
    expect(parsePeriEventSettings(undefined)).toBeNull()
  })
})
