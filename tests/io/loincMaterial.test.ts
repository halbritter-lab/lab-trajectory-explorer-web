import { describe, expect, it } from 'vitest'
import { loadDatasetFromWorkbook } from '../../src/io/loadDataset'
import { isKdigoCreatinineSeries, isSerumCreatinineSeries, nonSerumCreatinineLoincName } from '../../src/core/domains/nephrology/analytes'
import { appendComputedEgfr, creatinineSourceOptions } from '../../src/core/domains/nephrology/egfr/series'
import { akiEpisodeRows } from '../../src/workspace/aki-episodes'

/**
 * LOINC as the material mark for creatinine (owner decision of 2026-11-21):
 * creatinine with a urine code becomes its own, labelled series, excluded from
 * AKI detection and eGFR. Patient 103 of the review file: serum (2160-0) and
 * urine (2161-8) creatinine under one name on the same days.
 */
const HEADER = 'patientId,labDate,testName,unit,value,loinc,sex,ageAtLab'
const P103 = [
  ['2021-01-10', 0.98, 3.92, 47], ['2021-07-09', 1.1, 4.4, 47], ['2022-01-05', 1.17, 4.68, 48], ['2022-07-04', 1.21, 4.84, 48], ['2022-12-31', 1.35, 5.4, 48],
].flatMap(([date, serum, urine, age]) => [`103,${date},Kreatinin,mg/dl,${serum},2160-0,m,${age}`, `103,${date},Kreatinin,mg/dl,${urine},2161-8,m,${age}`])
  .concat('103,2023-06-29,Kreatinin,mg/dl,5.72,2161-8,m,49')
const bytes = (lines: string[]) => new TextEncoder().encode(`${HEADER}\n${lines.join('\n')}\n`).buffer
const TODAY = new Date(2026, 10, 21)
const URINE = 'Kreatinin (urine, LOINC 2161-8)'

describe('creatinine with a non-serum LOINC code', () => {
  it('becomes its own labelled series that is neither an eGFR source nor AKI input', () => {
    const { rows, diagnostics } = loadDatasetFromWorkbook(bytes(P103), { today: TODAY })
    expect(rows.filter((r) => r.bezeichnung === 'Kreatinin').map((r) => r.wertNum)).toEqual([0.98, 1.1, 1.17, 1.21, 1.35])
    expect(rows.filter((r) => r.bezeichnung === URINE).map((r) => [r.wertNum, r.einheit, r.loinc])).toEqual([3.92, 4.4, 4.68, 4.84, 5.4, 5.72].map((v) => [v, 'mg/dl', '2161-8']))
    expect(isSerumCreatinineSeries(URINE, 'mg/dl')).toBe(false)
    expect(isKdigoCreatinineSeries(URINE, 'mg/dl')).toBe(false)
    expect(creatinineSourceOptions(rows)).toEqual([['Kreatinin', 'mg/dl']])
    expect(akiEpisodeRows(rows, [])).toEqual([])
    const computed = appendComputedEgfr(rows, { formula: 'ckd-epi-2021' }).slice(rows.length)
    expect(computed.map((r) => r.wertNum)).toEqual([95.7, 83.3, 76.9, 73.9, 64.8])
    expect(diagnostics).toEqual([expect.objectContaining({
      source: 'labs', severity: 'warning', scope: 'sheet',
      reason: 'Kreatinin: 6 values with LOINC code 2161-8 were imported as the separate parameter "Kreatinin (urine, LOINC 2161-8)"; the code marks creatinine that is not from serum, so it is not used for AKI detection or eGFR.',
      rows: expect.arrayContaining([{ row: 3, patientId: 103, date: '2021-01-10', parameter: 'Kreatinin (urine, LOINC 2161-8) [mg/dl]', value: '3.92' }]),
    })])
  })

  // Until the same-day rule of 2026-11-21 the mixed series also gave five false
  // stage 3 episodes, each with baseline and peak on one day. Values of one day
  // without a time of day are no longer compared with each other.
  it('differs from the mixed series the import formed before: eleven eGFR values from serum and urine', () => {
    const mixed = loadDatasetFromWorkbook(bytes(P103), { today: TODAY, separateSeries: () => null })
    expect(new Set(mixed.rows.map((r) => r.bezeichnung))).toEqual(new Set(['Kreatinin']))
    expect(akiEpisodeRows(mixed.rows, [])).toEqual([])
    expect(appendComputedEgfr(mixed.rows, { formula: 'ckd-epi-2021' }).length - mixed.rows.length).toBe(11)
  })

  it('applies to 2161-8 and 14683-7 only; whole-blood codes and serum codes stay in the series', () => {
    const { rows } = loadDatasetFromWorkbook(bytes([
      '1,2024-01-01,Kreatinin,µmol/l,9000,14683-7,m,50',
      '1,2024-01-02,Kreatinin,mg/dl,1.0,38483-4,m,50',
      '1,2024-01-03,Kreatinin,mg/dl,1.0,59826-8,m,50',
      '1,2024-01-04,Kreatinin,mg/dl,1.0,2160-0,m,50',
      '1,2024-01-05,Kreatinin,mg/dl,1.0,,m,50',
      '1,2024-01-06,Creatinine,mg/dl,80, 2161-8 ,m,50',
    ]), { today: TODAY })
    expect(rows.map((r) => r.bezeichnung)).toEqual(['Kreatinin (urine, LOINC 14683-7)', 'Kreatinin', 'Kreatinin', 'Kreatinin', 'Kreatinin', 'Creatinine (urine, LOINC 2161-8)'])
    expect(creatinineSourceOptions(rows)).toEqual([['Kreatinin', 'mg/dl']])
  })

  it('leaves other tests and names that already mark the material untouched', () => {
    expect(nonSerumCreatinineLoincName('Kreatinin', '2161-8')).toBe('Kreatinin (urine, LOINC 2161-8)')
    expect(nonSerumCreatinineLoincName('Kreatinin Urin', '2161-8')).toBeNull()
    expect(nonSerumCreatinineLoincName('Kreatinin i.U.', '14683-7')).toBeNull()
    expect(nonSerumCreatinineLoincName('Harnstoff', '2161-8')).toBeNull()
    expect(nonSerumCreatinineLoincName('Kreatinin', '2160-0')).toBeNull()
    expect(nonSerumCreatinineLoincName('Kreatinin', null)).toBeNull()
    expect(nonSerumCreatinineLoincName('Kreatinin', 'toString')).toBeNull()
    // Name and code disagree: the non-serum name alone already excludes the series.
    expect(isSerumCreatinineSeries('Kreatinin Urin', 'mg/dl')).toBe(false)
  })
})

describe('several LOINC codes in one parameter', () => {
  it('are reported per parameter with the number of values per code, and change nothing', () => {
    const { rows, diagnostics } = loadDatasetFromWorkbook(bytes([
      '1,2024-01-01,eGFR,ml/min/1.73m2,60,62238-1,m,50',
      '1,2024-02-01,eGFR,ml/min/1.73m2,58,98979-8,m,50',
      '1,2024-03-01,eGFR,ml/min/1.73m2,57,98979-8,m,50',
      '1,2024-04-01,eGFR,ml/min/1.73m2,56,,m,50',
      '1,2024-01-01,Kreatinin,mg/dl,1.0,2160-0,m,50',
      '1,2024-02-01,Kreatinin,µmol/l,90,2160-0,m,50',
    ]), { today: TODAY })
    expect(rows.filter((r) => r.bezeichnung === 'eGFR')).toHaveLength(4)
    expect(diagnostics).toEqual([{
      source: 'labs', sheet: 'Sheet1', patientId: null, severity: 'warning', scope: 'sheet',
      reason: 'eGFR [ml/min/1.73m2]: 2 LOINC codes in one parameter: 62238-1 (1 value), 98979-8 (2 values). The values stay one series; check that they are the same test and material.',
    }])
  })
})
