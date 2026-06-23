import { describe, it, expect } from 'vitest'
import { akiExclusionBands, fitAkiAware, isCreatinineMgdl, episodesForSeries } from '../../../src/core/aki/akiAware'
import type { AkiEpisode } from '../../../src/core/aki/kdigo'
import type { SeriesPoint } from '../../../src/core/stats/series'
import type { LabRow } from '../../../src/core/types'

const d = (s: string) => new Date(s)
const ep = (date: string, stage = 1): AkiEpisode => ({
  date: d(date), baselineDate: d(date), baselineValue: 1, peakValue: 1.5, peakDate: d(date),
  criterion: 'absolute_0_3_mg_dl_48h', stage,
})
function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: d('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('akiExclusionBands', () => {
  it('builds [date, date+exclusionDays] bands and merges overlaps', () => {
    const bands = akiExclusionBands([ep('2020-01-01'), ep('2020-01-20'), ep('2020-06-01')], 30)
    expect(bands).toHaveLength(2)
    expect(bands[0].start.toISOString().slice(0, 10)).toBe('2020-01-01')
    expect(bands[0].end.toISOString().slice(0, 10)).toBe('2020-02-19') // Jan 20 + 30 d
    expect(bands[1].start.toISOString().slice(0, 10)).toBe('2020-06-01')
  })
  it('returns [] for no episodes', () => {
    expect(akiExclusionBands([], 30)).toEqual([])
  })
})

describe('fitAkiAware', () => {
  // Creatinine with one AKI spike on 2020-08-01 (abs +1.25 within 48 h of 07-30).
  const pts: SeriesPoint[] = [
    { date: d('2019-01-01T00:00:00Z'), value: 1.0 },
    { date: d('2019-06-01T00:00:00Z'), value: 1.1 },
    { date: d('2020-01-01T00:00:00Z'), value: 1.05 },
    { date: d('2020-07-30T00:00:00Z'), value: 1.15 },
    { date: d('2020-08-01T00:00:00Z'), value: 2.4 },
    { date: d('2020-08-10T00:00:00Z'), value: 1.8 },
    { date: d('2020-10-01T00:00:00Z'), value: 1.2 },
    { date: d('2021-06-01T00:00:00Z'), value: 1.3 },
  ]
  it('excludes points in [episode, episode+exclusionDays] and fits the rest', () => {
    const r = fitAkiAware(pts, 30)
    expect(r.keptIdx).toEqual([0, 1, 2, 3, 6, 7]) // 08-01 and 08-10 fall in the window
    expect(r.fit.reason).toBeNull()
    expect(r.fit.slope).toBeGreaterThan(0)
    expect(r.fit.slope).toBeLessThan(0.5) // the spike no longer dominates the slope
  })
  it('keeps everything and detects no episodes on a calm series', () => {
    const flat: SeriesPoint[] = [
      { date: d('2019-01-01'), value: 1.0 }, { date: d('2020-01-01'), value: 1.1 }, { date: d('2021-01-01'), value: 1.2 },
    ]
    const r = fitAkiAware(flat, 30)
    expect(r.keptIdx).toEqual([0, 1, 2])
    expect(r.episodes).toEqual([])
    expect(r.fit.reason).toBeNull()
  })
  it('returns n_below_threshold when fewer than 3 points survive', () => {
    const three: SeriesPoint[] = [
      { date: d('2020-01-02'), value: 1.0 }, { date: d('2020-01-10'), value: 1.6 }, { date: d('2020-01-20'), value: 1.4 },
    ]
    const r = fitAkiAware(three, 30, [ep('2020-01-01')])
    expect(r.keptIdx).toEqual([])
    expect(r.fit.reason).toBe('n_below_threshold')
    expect(Number.isNaN(r.fit.slope)).toBe(true)
  })
  it('uses precomputed episodes verbatim when provided (empty list excludes nothing)', () => {
    const r = fitAkiAware(pts, 30, [])
    expect(r.keptIdx).toHaveLength(pts.length)
  })
})

describe('isCreatinineMgdl', () => {
  it('matches serum creatinine in mg/dl only', () => {
    expect(isCreatinineMgdl('Kreatinin', 'mg/dl')).toBe(true)
    expect(isCreatinineMgdl('Kreatinin HP', 'mg/dl')).toBe(true)
    expect(isCreatinineMgdl('Kreatinin', 'µmol/l')).toBe(false)
    expect(isCreatinineMgdl('Kreatinin im Urin', 'mg/dl')).toBe(false)
    expect(isCreatinineMgdl('HbA1c', '%')).toBe(false)
  })
})

describe('episodesForSeries', () => {
  const creat = [
    row({ labDatum: d('2020-01-01T00:00:00Z'), wertNum: 1.0 }),
    row({ labDatum: d('2020-01-02T00:00:00Z'), wertNum: 1.5 }),
    row({ labDatum: d('2020-02-01T00:00:00Z'), wertNum: 1.0 }),
  ]
  it('detects on itself for a creatinine mg/dl series', () => {
    expect(episodesForSeries(creat, 1, 'Kreatinin', 'mg/dl').length).toBeGreaterThan(0)
  })
  it('uses the patient creatinine series for other analytes (cross-series)', () => {
    const egfr = [row({ bezeichnung: 'eGFR (CKD-EPI 2021, computed)', einheit: 'ml/min/1,73m²', wertNum: 60 })]
    const eps = episodesForSeries([...creat, ...egfr], 1, 'eGFR (CKD-EPI 2021, computed)', 'ml/min/1,73m²')
    expect(eps.length).toBeGreaterThan(0)
  })
  it('returns [] when the patient has no creatinine mg/dl rows', () => {
    const only = [row({ bezeichnung: 'HbA1c', einheit: '%', wertNum: 6 })]
    expect(episodesForSeries(only, 1, 'HbA1c', '%')).toEqual([])
  })
  it('ignores other patients rows', () => {
    const other = creat.map((r) => ({ ...r, patientId: 2 }))
    expect(episodesForSeries(other, 1, 'Kreatinin', 'mg/dl')).toEqual([])
  })
})
