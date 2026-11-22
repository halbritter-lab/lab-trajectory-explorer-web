import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { applySeriesMerges, parseSeriesMerges, type SeriesMerge } from '../../../src/core/analysis/seriesMerge'
import { mergeUnitConversion, seriesMergeModule } from '../../../src/core/domains/nephrology/seriesMergeModule'
import { appendComputedEgfr, creatinineSourceOptions, defaultCreatinineSource, importedCreatinineSourceOptions, patientCreatinineSources } from '../../../src/core/domains/nephrology/egfr/series'
import { episodesForSeries, largestCreatinineSeries, sameDayUnorderedCreatinine } from '../../../src/core/domains/nephrology/aki/akiAware'
import { computeAnalysisResult, defaultAnalysisSettings, parseAnalysisSettings } from '../../../src/core/analysis/registry'
import { loadLabRowsWithDiagnostics } from '../../../src/core/parse/loader'
import { loadDatasetFromWorkbook } from '../../../src/io/loadDataset'
import { fitGlobal } from '../../../src/core/stats/series'
import type { LabRow } from '../../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1,0', wertNum: 1.0, wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: 50, ...p }
}

const creatinineMerge: SeriesMerge = { name: 'Kreatinin (merged)', unit: 'mg/dl', sources: [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, { bezeichnung: 'Kreatinin', einheit: 'µmol/l' }] }

describe('applySeriesMerges', () => {
  it('copies every row of each source into the merged series and keeps the sources', () => {
    const rows = [
      row({ labDatum: new Date('2020-01-01'), wertNum: 1.1, wert: '1,1', sourceRow: 2, labMethod: 'Jaffe' }),
      row({ labDatum: new Date('2020-02-01'), einheit: 'µmol/l', wertNum: 110, wert: '110', labMethod: 'enzymatic' }),
      row({ bezeichnung: 'Hb', einheit: 'g/dl', wertNum: 12 }),
    ]
    const result = applySeriesMerges(rows, [creatinineMerge], mergeUnitConversion)
    expect(result.rows.slice(0, 3)).toEqual(rows)
    const merged = result.rows.slice(3)
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ bezeichnung: 'Kreatinin (merged)', einheit: 'mg/dl', wertNum: 1.1, wert: '1,1', labMethod: 'Jaffe', mergedFrom: { bezeichnung: 'Kreatinin', einheit: 'mg/dl' } })
    expect(merged[0].sourceRow).toBeUndefined()
    // 110 µmol/l ÷ 88.42 = 1.24406…; the value text is rounded to two decimals.
    expect(merged[1].wertNum).toBeCloseTo(110 / 88.42, 12)
    expect(merged[1].wert).toBe('1,24')
    expect(merged[1].mergedFrom).toEqual({ bezeichnung: 'Kreatinin', einheit: 'µmol/l' })
    expect(result.applied[0]).toMatchObject({ counts: [1, 1], absent: [], crossSourceDays: 0 })
    expect(result.applied[0].factors[1]).toBeCloseTo(1 / 88.42, 12)
  })

  it('converts mg/dl into µmol/l and keeps bounds as bounds', () => {
    const rows = [row({ wertNum: 0.5, wert: '<0,5', wertOperator: '<' }), row({ einheit: 'µmol/l', wertNum: 97, wert: '97' })]
    const merged = applySeriesMerges(rows, [{ ...creatinineMerge, unit: 'µmol/l' }], mergeUnitConversion).rows.slice(2)
    expect(merged[0]).toMatchObject({ wertOperator: '<', wert: '44,2' })
    expect(merged[0].wertNum).toBeCloseTo(44.21, 10)
    expect(merged[1]).toMatchObject({ wertNum: 97, wert: '97' })
  })

  it('keeps both values of a day on which two sources meet (OD-80)', () => {
    const rows = [row({ wertNum: 1.0 }), row({ einheit: 'µmol/l', wertNum: 97 })]
    const result = applySeriesMerges(rows, [creatinineMerge], mergeUnitConversion)
    expect(result.rows.filter(r => r.mergedFrom)).toHaveLength(2)
    expect(result.applied[0].crossSourceDays).toBe(1)
  })

  it('converts no pair other than serum creatinine', () => {
    const rows = [row({ bezeichnung: 'Harnstoff', einheit: 'mg/dl' }), row({ bezeichnung: 'Harnstoff', einheit: 'mmol/l' })]
    const merge: SeriesMerge = { name: 'Harnstoff (merged)', unit: 'mg/dl', sources: [{ bezeichnung: 'Harnstoff', einheit: 'mg/dl' }, { bezeichnung: 'Harnstoff', einheit: 'mmol/l' }] }
    const result = applySeriesMerges(rows, [merge], mergeUnitConversion)
    expect(result.rows).toBe(rows)
    expect(result.skipped).toEqual([{ merge, reason: 'unit_not_convertible', source: { bezeichnung: 'Harnstoff', einheit: 'mmol/l' } }])
    // Urine creatinine does not convert either.
    expect(mergeUnitConversion({ bezeichnung: 'Kreatinin im Urin', einheit: 'µmol/l' }, 'mg/dl')).toBeNull()
    // Unit spellings that differ only in case convert with factor 1.
    expect(mergeUnitConversion({ bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }, 'mL/min/1,73m²')).toBe(1)
  })

  it('skips a merge whose name is an imported series, a repeated source and a merge without two sources present', () => {
    const rows = [row({}), row({ einheit: 'µmol/l', wertNum: 97 }), row({ bezeichnung: 'Kreatinin enzym.', wertNum: 1.0 })]
    const taken: SeriesMerge = { ...creatinineMerge, name: 'Kreatinin' }
    const second: SeriesMerge = { name: 'Other', unit: 'mg/dl', sources: [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, { bezeichnung: 'Kreatinin enzym.', einheit: 'mg/dl' }] }
    const absent: SeriesMerge = { name: 'Lonely', unit: 'mg/dl', sources: [{ bezeichnung: 'Kreatinin enzym.', einheit: 'mg/dl' }, { bezeichnung: 'Missing', einheit: 'mg/dl' }] }
    const result = applySeriesMerges(rows, [taken, creatinineMerge, second, absent], mergeUnitConversion)
    expect(result.skipped.map(s => s.reason)).toEqual(['name_taken', 'source_in_other_merge', 'too_few_sources'])
    expect(result.applied.map(a => a.merge.name)).toEqual(['Kreatinin (merged)'])
  })

  it('reports absent sources and merges the present ones when two remain', () => {
    const rows = [row({}), row({ bezeichnung: 'Kreatinin enzym.' })]
    const merge: SeriesMerge = { name: 'Crea', unit: 'mg/dl', sources: [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, { bezeichnung: 'Kreatinin enzym.', einheit: 'mg/dl' }, { bezeichnung: 'Kreatinin (Labor B)', einheit: 'mg/dl' }] }
    const result = applySeriesMerges(rows, [merge], mergeUnitConversion)
    expect(result.applied[0].absent).toEqual([{ bezeichnung: 'Kreatinin (Labor B)', einheit: 'mg/dl' }])
    expect(result.applied[0].counts).toEqual([1, 1, 0])
  })

  it('never uses a derived row as a source', () => {
    const rows = [row({}), row({ bezeichnung: 'Kreatinin enzym.' }), row({ bezeichnung: 'Kreatinin enzym.', sourceSeries: { bezeichnung: 'x', einheit: 'mg/dl' } })]
    const merge: SeriesMerge = { name: 'Crea', unit: 'mg/dl', sources: [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }, { bezeichnung: 'Kreatinin enzym.', einheit: 'mg/dl' }] }
    expect(applySeriesMerges(rows, [merge], mergeUnitConversion).applied[0].counts).toEqual([1, 1])
  })
})

describe('stored merges', () => {
  it('parses a valid list and rejects malformed ones; settings without merges get none', () => {
    expect(parseSeriesMerges([creatinineMerge])).toEqual([creatinineMerge])
    expect(parseSeriesMerges([{ ...creatinineMerge, sources: [creatinineMerge.sources[0]] }])).toBeNull()
    expect(parseSeriesMerges([{ ...creatinineMerge, name: ' ' }])).toBeNull()
    expect(parseSeriesMerges('x')).toBeNull()
    expect(seriesMergeModule.parseSettings({ merges: [creatinineMerge] })).toEqual({ merges: [creatinineMerge] })
    expect(seriesMergeModule.parseSettings({ merges: 1 })).toBeNull()
    const { seriesMerge: _merge, ...older } = defaultAnalysisSettings()
    expect(parseAnalysisSettings(older)?.seriesMerge).toEqual({ merges: [] })
  })
})

describe('merged series and the eGFR source rule (issue #65)', () => {
  // Patient 1: mg/dl and µmol/l; patient 2: µmol/l only (fallback); patient 3: mg/dl under another name.
  const rows = [
    row({ patientId: 1, wertNum: 1.0 }),
    row({ patientId: 1, einheit: 'µmol/l', labDatum: new Date('2020-02-01'), wertNum: 97 }),
    row({ patientId: 2, einheit: 'µmol/l', wertNum: 120 }),
    row({ patientId: 3, bezeichnung: 'Kreatinin enzym.', wertNum: 0.9 }),
  ]
  const merged = applySeriesMerges(rows, [creatinineMerge], mergeUnitConversion).rows

  it('keeps every patient\'s source, gap and fallback while the merged series is not chosen', () => {
    const selected: [string, string] = ['Kreatinin', 'mg/dl']
    expect(patientCreatinineSources(merged, selected)).toEqual(patientCreatinineSources(rows, selected))
    expect(appendComputedEgfr(merged, {}).filter(r => r.sourceSeries)).toEqual(appendComputedEgfr(rows, {}).filter(r => r.sourceSeries))
    // The merged series is offered but never chosen automatically.
    expect(creatinineSourceOptions(merged)).toContainEqual(['Kreatinin (merged)', 'mg/dl'])
    expect(defaultCreatinineSource(importedCreatinineSourceOptions(merged))).toEqual(['Kreatinin', 'mg/dl'])
  })

  it('computes the eGFR from the merged series when it is chosen as the source', () => {
    const selected: [string, string] = ['Kreatinin (merged)', 'mg/dl']
    const sources = patientCreatinineSources(merged, selected)
    expect(sources.get('1')?.source).toEqual(selected)
    expect(sources.get('2')?.source).toEqual(selected)
    // Patient 3 has no row in the merged series and keeps the rule's gap.
    expect(sources.get('3')).toMatchObject({ source: null, gap: 'other_mgdl' })
    const egfr = appendComputedEgfr(merged, { source: selected }).filter(r => r.sourceSeries)
    expect(egfr.map(r => r.patientId)).toEqual([1, 1, 2])
    expect(egfr.every(r => r.sourceSeries?.bezeichnung === 'Kreatinin (merged)')).toBe(true)
  })
})

describe('merged series and AKI detection', () => {
  // A rise of 0.4 mg/dl within 48 hours exists only across the two sources.
  const rows = [
    row({ labDatum: new Date('2020-01-01'), wertNum: 1.0 }),
    row({ labDatum: new Date('2020-01-02'), einheit: 'µmol/l', wertNum: 1.4 * 88.42 }),
    row({ labDatum: new Date('2020-01-03'), wertNum: 1.0 }),
    row({ labDatum: new Date('2020-01-03'), bezeichnung: 'Hb', einheit: 'g/dl', wertNum: 12 }),
  ]
  const merged = applySeriesMerges(rows, [creatinineMerge], mergeUnitConversion).rows

  it('detects on the merged series itself and never makes it the creatinine source of other columns', () => {
    expect(episodesForSeries(merged, 1, 'Kreatinin', 'mg/dl')).toEqual([])
    expect(episodesForSeries(merged, 1, 'Kreatinin (merged)', 'mg/dl')).toHaveLength(1)
    expect(largestCreatinineSeries(merged).every(r => !r.mergedFrom)).toBe(true)
    expect(episodesForSeries(merged, 1, 'Hb', 'g/dl')).toEqual(episodesForSeries(rows, 1, 'Hb', 'g/dl'))
    expect(sameDayUnorderedCreatinine(merged)).toEqual(sameDayUnorderedCreatinine(rows))
  })
})

describe('laboratory or method column', () => {
  it('is read from the accepted headers and kept per row', () => {
    for (const header of ['Labor', 'Laboratory', 'Method', 'Methode', 'lab_method']) {
      const { rows } = loadLabRowsWithDiagnostics([
        { patientId: 1, labDate: '2024-01-01', testName: 'Kreatinin', unit: 'mg/dl', value: '1,0', [header]: 'Lab A' },
        { patientId: 1, labDate: '2024-02-01', testName: 'Kreatinin', unit: 'mg/dl', value: '1,1', [header]: '' },
      ])
      expect(rows.map(r => r.labMethod), header).toEqual(['Lab A', undefined])
    }
  })
  it('names the column it ignores when two accepted headers are present', () => {
    const { rows, issues } = loadLabRowsWithDiagnostics([{ patientId: 1, labDate: '2024-01-01', testName: 'Kreatinin', unit: 'mg/dl', value: '1,0', Labor: 'Lab A', Methode: 'Jaffe' }])
    expect(rows[0].labMethod).toBe('Lab A')
    expect(issues.some(issue => issue.reason.includes('"Labor" and "Methode" hold the same field'))).toBe(true)
  })
})

describe('worked example of the method reference (demo data)', () => {
  const dataset = loadDatasetFromWorkbook(readFileSync('public/test_labs.xlsx'))
  const settings = (merges: SeriesMerge[]) => ({ ...defaultAnalysisSettings(), seriesMerge: { merges } })
  const run = (merges: SeriesMerge[]) => computeAnalysisResult({ rows: dataset.rows, manualDemographics: {}, patientAttributes: dataset.patientAttributes, events: dataset.events, settings: settings(merges) })
  const slope = (rows: LabRow[], patient: number, name: string) => fitGlobal(rows.filter(r => r.patientId === patient && r.bezeichnung === name && r.wertNum !== null && r.labDatum).map(r => ({ date: r.labDatum!, value: r.wertNum! }))).slope

  it('merges the two eGFR names of patient 3 into one series of 12 values', () => {
    const egfrMerge: SeriesMerge = { name: 'eGFR (merged)', unit: 'ml/min/1,73m²', sources: [
      { bezeichnung: 'eGFR', einheit: 'ml/min/1,73m²' }, { bezeichnung: 'eGFR (CKD-EPI)', einheit: 'ml/min/1,73m²' }, { bezeichnung: 'eGFR (CKD-EPI 2021)', einheit: 'ml/min/1,73m²' }] }
    const rows = run([egfrMerge]).rows
    expect(rows.filter(r => r.bezeichnung === 'eGFR (merged)')).toHaveLength(228 + 6 + 6)
    const patient3 = rows.filter(r => r.patientId === 3 && r.bezeichnung === 'eGFR (merged)')
    expect(patient3).toHaveLength(12)
    // Each name falls by about 7 and 6.5 per year; the merged series, across the jump from 65.29 to 70.0, by 2.22.
    expect(slope(rows, 3, 'eGFR (CKD-EPI)')).toBeCloseTo(-7.004, 3)
    expect(slope(rows, 3, 'eGFR (CKD-EPI 2021)')).toBeCloseTo(-6.498, 3)
    expect(slope(rows, 3, 'eGFR (merged)')).toBeCloseTo(-2.220, 3)
  })

  it('merges the two creatinine units of patient 2 into mg/dl', () => {
    const rows = run([creatinineMerge]).rows
    const patient2 = rows.filter(r => r.patientId === 2 && r.bezeichnung === 'Kreatinin (merged)')
    expect(patient2).toHaveLength(18)
    const first = patient2.find(r => r.mergedFrom?.einheit === 'µmol/l')!
    expect(first.wert).toBe('1,24')
    expect(slope(rows.filter(r => r.einheit === 'mg/dl'), 2, 'Kreatinin')).toBeCloseTo(0.2504, 4)
    expect(slope(rows, 2, 'Kreatinin (merged)')).toBeCloseTo(0.2152, 4)
    // Patient 10 has µmol/l only: the merged slope is 15.618 µmol/l per year divided by 88.42.
    expect(slope(rows, 10, 'Kreatinin (merged)')).toBeCloseTo(15.6180 / 88.42, 4)
  })

  it('computes the eGFR of patients 2 and 10 from the merged series only when it is chosen', () => {
    const withSource = (source: [string, string] | null) => computeAnalysisResult({ rows: dataset.rows, manualDemographics: {}, patientAttributes: dataset.patientAttributes, events: dataset.events,
      settings: { ...settings([creatinineMerge]), egfr: { formula: 'ckd-epi-2021', source, paediatric: 'ckid-u25-ekfc' } } }).rows.filter(r => r.sourceSeries)
    const before = computeAnalysisResult({ rows: dataset.rows, manualDemographics: {}, patientAttributes: dataset.patientAttributes, events: dataset.events,
      settings: { ...settings([]), egfr: { formula: 'ckd-epi-2021', source: ['Kreatinin', 'mg/dl'], paediatric: 'ckid-u25-ekfc' } } }).rows.filter(r => r.sourceSeries)
    // Merging alone changes no computed eGFR value.
    expect(withSource(['Kreatinin', 'mg/dl'])).toEqual(before)
    const merged = withSource(['Kreatinin (merged)', 'mg/dl'])
    expect(merged.filter(r => r.patientId === 2)).toHaveLength(18)
    expect(before.filter(r => r.patientId === 2)).toHaveLength(14)
    expect(merged.filter(r => r.patientId === 10).map(r => r.wertNum)).toEqual(before.filter(r => r.patientId === 10).map(r => r.wertNum))
  })
})
