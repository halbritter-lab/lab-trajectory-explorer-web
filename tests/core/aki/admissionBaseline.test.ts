import { describe, expect, it } from 'vitest'
import { findKdigoAkiEpisodes } from '../../../src/core/domains/nephrology/aki/kdigo'
import { episodesForSeries } from '../../../src/core/domains/nephrology/aki/akiAware'
import type { ClinicalEvent } from '../../../src/core/events/events'
import type { LabRow } from '../../../src/core/types'

// AKI present at the first value of an admission (decided 2026-11-22, row akifirst, issue #4).
const DAY = 86_400_000
const t0 = Date.UTC(2024, 0, 1)
const at = (day: number) => new Date(t0 + day * DAY)
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null
const pts = (values: [number, number][]) => values.map(([day, value]) => ({ date: at(day), value }))
const row = (day: number, value: number): LabRow => ({ patientId: 1, labDatum: at(day), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: String(value), wertNum: value, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null })

describe('look-back baseline of the first value of an admission', () => {
  it('compares the first value after a gap with the mean of the values 7 to 365 days before', () => {
    // 1.0 and 1.2 as outpatient values, then an admission on day 100 with 2.0 and 1.9 the next day.
    const episodes = findKdigoAkiEpisodes(pts([[0, 1.0], [30, 1.2], [100, 2.0], [101, 1.9]]))
    expect(episodes).toHaveLength(1)
    const [e] = episodes
    expect(iso(e.date)).toBe('2024-04-10')
    expect(e).toMatchObject({ criterion: 'relative_1_5x_lookback_mean', baselineSource: 'lookback_mean', baselineN: 2, stage: 1, stageValue: 2.0, peakValue: 2.0 })
    expect(e.baselineValue).toBeCloseTo(1.1, 12)
    // The baseline date is the latest value of the mean; staging uses the mean (2.0 / 1.1 = 1.82).
    expect(iso(e.baselineDate)).toBe('2024-01-31')
    expect(e.stageReferenceValue).toBeCloseTo(1.1, 12)
    // 1.9 the next day is no crossing against 2.0 and ends the episode.
    expect(iso(e.endDate)).toBe('2024-04-11')
    // Without the look-back baseline (until 2026-11-22) no episode.
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [30, 1.2], [100, 2.0], [101, 1.9]]), { lookbackBaseline: false })).toEqual([])
  })

  it('needs 1.5 times the mean and grades the stage against it', () => {
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [30, 1.2], [100, 1.6], [101, 1.6]]))).toEqual([])
    // 1.65 / 1.1 = 1.5 exactly: inclusive.
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [30, 1.2], [100, 1.65], [101, 1.6]]))).toHaveLength(1)
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [30, 1.2], [100, 3.5], [101, 3.0]]))[0].stage).toBe(3)
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [30, 1.2], [100, 2.3], [101, 2.0]]))[0].stage).toBe(2)
    // The absolute 0.3 mg/dl criterion needs two values within 48 hours and is not applied to the look-back mean.
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [30, 1.2], [100, 1.5], [101, 1.4]]))).toEqual([])
  })

  it('counts the look-back window in calendar days, 365 days inclusive', () => {
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [365, 2.0], [366, 2.0]]))[0]).toMatchObject({ baselineN: 1, baselineValue: 1.0 })
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [366, 2.0], [367, 2.0]]))).toEqual([])
    // A value 8 days before is in the window (7 days before would be in the 7-day window itself).
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [8, 2.0], [9, 2.0]]))[0]).toMatchObject({ criterion: 'relative_1_5x_lookback_mean' })
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [7, 2.0], [8, 2.0]]))[0]).toMatchObject({ criterion: 'relative_1_5x_7d', baselineSource: 'window' })
  })

  it('treats a value after a gap as an admission only when a further value follows on one of the next two days', () => {
    // A single value after the gap, a further value three days later, or a second value of the same date: no admission.
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [100, 2.0]]))).toEqual([])
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [100, 2.0], [103, 2.0]]))).toEqual([])
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [100, 2.0], [100, 2.1]]))).toEqual([])
    expect(findKdigoAkiEpisodes(pts([[0, 1.0], [100, 2.0], [102, 2.0]]))).toHaveLength(1)
  })

  it('ends an open episode at the gap before the admission and opens a new one', () => {
    // An open episode (1.0, 1.6 on days 0 and 1), then an admission on day 40.
    const episodes = findKdigoAkiEpisodes(pts([[0, 1.0], [1, 1.6], [40, 3.0], [41, 2.9]]))
    expect(episodes.map((e) => [iso(e.date), iso(e.endDate), e.endedByGap, e.criterion])).toEqual([
      ['2024-01-02', '2024-02-10', true, 'absolute_0_3_mg_dl_48h'],
      ['2024-02-10', '2024-02-11', false, 'relative_1_5x_lookback_mean'],
    ])
    expect(episodes[1].baselineValue).toBeCloseTo(1.3, 12)
  })

  it('is no admission after a gap that a dated acute dialysis interval bridges', () => {
    const acute: ClinicalEvent = { patientId: 1, type: 'dialysis', intent: 'acute', date: at(50), endDate: at(98), title: 'CVVH', description: null, warning: '' }
    const rows = [row(0, 1.0), row(30, 1.2), row(45, 1.1), row(100, 2.0), row(101, 1.9)]
    expect(episodesForSeries(rows, 1, 'Kreatinin', 'mg/dl', [acute])).toEqual([])
    expect(episodesForSeries(rows, 1, 'Kreatinin', 'mg/dl', [])).toHaveLength(1)
  })
})

describe('retrospective detection from a fall during the admission (option, off by default)', () => {
  it('needs the option and no look-back value', () => {
    // No value 7 to 365 days before: 2.0 falls to 1.6 (0.4 mg/dl) during the admission.
    const values = pts([[0, 2.0], [1, 1.8], [3, 1.6], [400, 1.5]])
    expect(findKdigoAkiEpisodes(values)).toEqual([])
    const [e] = findKdigoAkiEpisodes(values, { retrospectiveFall: true })
    expect(e).toMatchObject({ criterion: 'retrospective_fall_in_admission', baselineSource: 'admission_minimum', baselineValue: 1.6, baselineN: 1, stage: 1 })
    expect(iso(e.date)).toBe('2024-01-01')
    expect(iso(e.baselineDate)).toBe('2024-01-04')
    // The admission ends with the gap: 1.5 on day 400 is not part of it.
    expect(findKdigoAkiEpisodes(pts([[0, 2.0], [1, 1.9], [400, 1.0], [401, 1.0]]), { retrospectiveFall: true })).toEqual([])
  })

  it('uses 0.3 mg/dl or the fall to 1/1.5, both inclusive', () => {
    expect(findKdigoAkiEpisodes(pts([[0, 2.0], [1, 1.8]]), { retrospectiveFall: true })).toEqual([])
    expect(findKdigoAkiEpisodes(pts([[0, 2.0], [1, 1.7]]), { retrospectiveFall: true })).toHaveLength(1)
    // 0.6 to 0.4 is a fall of 0.2 mg/dl but to 1/1.5.
    expect(findKdigoAkiEpisodes(pts([[0, 0.6], [2, 0.4]]), { retrospectiveFall: true })[0].stage).toBe(1)
  })

  it('does not apply when a look-back value exists, whether or not the look-back criterion is met', () => {
    expect(findKdigoAkiEpisodes(pts([[0, 1.4], [100, 2.0], [101, 1.6]]), { retrospectiveFall: true })).toEqual([])
  })

  it('is passed through by episodesForSeries', () => {
    const rows = [row(0, 2.0), row(1, 1.6)]
    expect(episodesForSeries(rows, 1, 'Kreatinin', 'mg/dl')).toEqual([])
    expect(episodesForSeries(rows, 1, 'Kreatinin', 'mg/dl', [], 48, { retrospectiveFall: true }).map((e) => e.criterion)).toEqual(['retrospective_fall_in_admission'])
  })
})
