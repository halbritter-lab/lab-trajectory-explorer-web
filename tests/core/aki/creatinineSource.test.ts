// Issue #34, "Creatinine source and AKI" (decided 2026-11-05).
import { describe, expect, it } from 'vitest'
import { isNonSerumName, isSerumCreatinineSeries } from '../../../src/core/domains/nephrology/analytes'
import { episodesForSeries, implausiblyHighCreatinineCount } from '../../../src/core/domains/nephrology/aki/akiAware'
import { akiEpisodesForSeriesContext } from '../../../src/core/domains/nephrology/aki/akiModule'
import { appendComputedEgfr, creatinineSourceOptions, implausiblyHighEgfrCount } from '../../../src/core/domains/nephrology/egfr/series'
import { computeAnalysisResult, defaultAnalysisSettings } from '../../../src/core/analysis/registry'
import type { LabRow } from '../../../src/core/types'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
function row(date: string, value: number, p: Partial<LabRow> = {}): LabRow {
  return { patientId: 1, labDatum: d(date), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: String(value), wertNum: value,
    wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: 60, ...p }
}

describe('non-serum creatinine names', () => {
  const nonSerum = ['Kreatinin i.U.', 'Kreatinin i.U', 'U-Kreatinin', 'Kreatinin SU', 'Kreatinin 24h-SU', 'Kreatinin (U)',
    'Kreatinin Dialysat', 'Creatinine dialysate', 'Kreatinin Punktat', 'Creatinine, fluid', 'Kreatinin Aszites',
    'Kreatinin im Urin', 'Kreatinin Harn', 'Urine creatinine', 'KreatininUR']
  const serum = ['Kreatinin', 'Kreatinin i.S.', 'Kreatinin (enzym.)', 'Kreatinin enzym.', 'Kreatinin Serum', 'S-Kreatinin',
    'Kreatinin HP', 'Creatinine serum', 'Kreatinin ur']
  it.each(nonSerum)('%s is not serum', (name) => {
    expect(isNonSerumName(name)).toBe(true)
    expect(isSerumCreatinineSeries(name, 'mg/dl')).toBe(false)
  })
  it.each(serum)('%s is serum', (name) => {
    expect(isNonSerumName(name)).toBe(false)
    expect(isSerumCreatinineSeries(name, 'mg/dl')).toBe(true)
  })
  it('offers no non-serum series as eGFR source and detects no AKI on it', () => {
    const urine = [row('2020-01-01', 50, { bezeichnung: 'Kreatinin SU' }), row('2020-01-02', 150, { bezeichnung: 'Kreatinin SU' })]
    expect(creatinineSourceOptions(urine)).toEqual([])
    expect(episodesForSeries(urine, 1, 'Kreatinin SU', 'mg/dl')).toEqual([])
    expect(episodesForSeries(urine, 1, 'HbA1c', '%')).toEqual([])
  })
})

describe('AKI source of a computed eGFR column', () => {
  // Stage II AKI in the eGFR source; a renamed method with more rows a year later.
  const rows = [
    row('2020-01-01', 1.0), row('2020-01-02', 2.0), row('2020-01-03', 1.9),
    ...[1, 2, 3, 4, 5].map((m) => row(`2021-0${m}-01`, 1.1, { bezeichnung: 'Kreatinin enzym.' })),
  ]
  const egfrName = 'eGFR (CKD-EPI 2021, computed)'
  const withEgfr = appendComputedEgfr(rows, { formula: 'ckd-epi-2021', source: ['Kreatinin', 'mg/dl'] })

  it('uses the series the eGFR was computed from', () => {
    expect(episodesForSeries(withEgfr, 1, 'Kreatinin', 'mg/dl')).toMatchObject([{ stage: 2, peakValue: 2.0 }])
    // Before: the eGFR column used `Kreatinin enzym.` (five rows) and showed no episode.
    expect(episodesForSeries(withEgfr, 1, egfrName, 'ml/min/1,73m²')).toMatchObject([{ stage: 2, peakValue: 2.0 }])
    // Other columns keep using the creatinine series with the most rows.
    expect(episodesForSeries(withEgfr, 1, 'HbA1c', '%')).toEqual([])
  })

  it('excludes the AKI window from the computed eGFR fit input', () => {
    const settings = defaultAnalysisSettings()
    const result = computeAnalysisResult({ rows, manualDemographics: {}, patientAttributes: {}, events: [],
      settings: { ...settings, egfr: { formula: 'ckd-epi-2021', source: null } } })
    const input = result.fitInputs.find((i) => i.kind === 'exclusion-windows' && i.seriesKey.bezeichnung === egfrName)
    expect(input?.windows.map((w) => w.start.toISOString().slice(0, 10))).toEqual(['2020-01-02'])
  })

  it('does not share the memoised episodes with other non-creatinine columns', () => {
    const cache = new Map<string, unknown>()
    const ctx = { patientId: 1, patientRows: withEgfr, cache }
    expect(akiEpisodesForSeriesContext({ ...ctx, seriesKey: { bezeichnung: 'HbA1c', einheit: '%' } })).toEqual([])
    expect(akiEpisodesForSeriesContext({ ...ctx, seriesKey: { bezeichnung: egfrName, einheit: 'ml/min/1,73m²' } })).toHaveLength(1)
  })
})

describe('creatinine plausibility warning counts', () => {
  it('counts exact serum creatinine above 25 mg/dl, µmol/l converted', () => {
    expect(implausiblyHighCreatinineCount([
      row('2020-01-01', 25), // boundary: not counted
      row('2020-01-02', 120), // µmol/l labelled mg/dl
      row('2020-01-03', 30, { wertOperator: '>' }), // bound: not counted
      row('2020-01-04', 2210, { einheit: 'µmol/l' }), // 24.99 mg/dl
      row('2020-01-05', 2211, { einheit: 'µmol/l' }), // 25.006 mg/dl
      row('2020-01-06', 120, { bezeichnung: 'Kreatinin SU' }), // urine: not serum
    ])).toBe(2)
  })
  it('counts exact computed eGFR above 200', () => {
    const computed = appendComputedEgfr([row('2020-01-01', 0.1, { patientAgeAtLab: 20 }), row('2020-01-02', 0.5, { patientAgeAtLab: 20 })])
      .filter((r) => r.sourceSeries)
    expect(computed.map((r) => r.wertNum)).toEqual([expect.any(Number), expect.any(Number)])
    expect(computed[0].wertNum).toBeGreaterThan(200)
    expect(computed[1].wertNum).toBeLessThanOrEqual(200)
    expect(implausiblyHighEgfrCount(computed)).toBe(1)
    expect(implausiblyHighEgfrCount([row('2020-01-01', 250, { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' })])).toBe(0)
  })
})
