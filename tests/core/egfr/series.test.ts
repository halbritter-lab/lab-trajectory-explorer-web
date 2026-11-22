import { describe, it, expect } from 'vitest'
import { creatinineSourceOptions, defaultCreatinineSource, appendComputedEgfr, patientCreatinineSources, MGDL_PER_UMOLL, COMPUTED_BEZEICHNUNG_SUFFIX } from '../../../src/core/domains/nephrology/egfr/series'
import { episodesForSeries } from '../../../src/core/domains/nephrology/aki/akiAware'
import type { LabRow } from '../../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1.0', wertNum: 1.0, wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: 50,
    ...p }
}

describe('creatinineSourceOptions', () => {
  it('lists serum creatinine pairs and excludes urine', () => {
    const rows = [
      row({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }),
      row({ bezeichnung: 'KreatininUR', einheit: 'mg/dl' }),
      row({ bezeichnung: 'HbA1c', einheit: '%' }),
    ]
    const opts = creatinineSourceOptions(rows)
    expect(opts).toEqual([['Kreatinin', 'mg/dl']])
  })

  it('excludes urine variants (Urin / Harn / -UR suffix) and non-serum units', () => {
    const rows = [
      row({ bezeichnung: 'Kreatinin im Urin', einheit: 'mg/dl' }),
      row({ bezeichnung: 'Kreatinin Harn', einheit: 'mg/dl' }),
      row({ bezeichnung: 'Urine creatinine', einheit: 'mg/dl' }),
      row({ bezeichnung: 'KreatininUR', einheit: 'mg/dl' }),
      row({ bezeichnung: 'Kreatinin', einheit: 'g/l' }), // wrong unit
    ]
    expect(creatinineSourceOptions(rows)).toEqual([])
  })

  it('accepts a µmol/l serum source and orders mg/dl before µmol/l', () => {
    const rows = [
      row({ bezeichnung: 'Kreatinin (µmol)', einheit: 'µmol/l' }),
      row({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }),
    ]
    expect(creatinineSourceOptions(rows)).toEqual([
      ['Kreatinin', 'mg/dl'],
      ['Kreatinin (µmol)', 'µmol/l'],
    ])
  })
})

describe('defaultCreatinineSource', () => {
  it('prefers plain Kreatinin in mg/dl', () => {
    expect(defaultCreatinineSource([['KreatininHP', 'mg/dl'], ['Kreatinin', 'mg/dl']])).toEqual(['Kreatinin', 'mg/dl'])
  })

  it('prefers an hp-hinted mg/dl source when no plain Kreatinin exists', () => {
    expect(defaultCreatinineSource([['Krea-Z', 'mg/dl'], ['KreatininHP', 'mg/dl']])).toEqual(['KreatininHP', 'mg/dl'])
  })

  it('falls back to µmol/l only when no mg/dl source is available', () => {
    expect(defaultCreatinineSource([['Kreatinin (µmol)', 'µmol/l']])).toEqual(['Kreatinin (µmol)', 'µmol/l'])
  })

  it('returns null for an empty option list', () => {
    expect(defaultCreatinineSource([])).toBeNull()
  })
})

describe('appendComputedEgfr', () => {
  it('appends computed eGFR rows flagged with the computed suffix and flipped operator', () => {
    const rows = [
      row({ patientId: 1, labDatum: new Date('2020-01-01'), wertNum: 1.0, wertOperator: '=' }),
      row({ patientId: 1, labDatum: new Date('2021-01-01'), wertNum: 2.0, wertOperator: '<' }),
    ]
    const out = appendComputedEgfr(rows, { formula: 'ckd-epi-2021' })
    const computed = out.filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
    expect(computed).toHaveLength(2)
    expect(computed[0].wertNum).toBeGreaterThan(0)
    expect(computed[1].wertOperator).toBe('>')
  })

  it('returns the input unchanged when demographics are absent', () => {
    const rows = [row({ patientSex: null, patientAgeAtLab: null })]
    expect(appendComputedEgfr(rows, { formula: 'ckd-epi-2021' })).toBe(rows)
  })

  it('drops pediatric rows (age < 18) silently', () => {
    const rows = [row({ patientAgeAtLab: 10 })]
    const out = appendComputedEgfr(rows, { formula: 'ckd-epi-2021' })
    expect(out.filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))).toHaveLength(0)
  })

  it('converts a µmol/l source to mg/dl before computing (same eGFR as the mg/dl input)', () => {
    const mgdl = appendComputedEgfr(
      [row({ bezeichnung: 'Kreatinin', einheit: 'mg/dl', wertNum: 1.0, wert: '1.0' })],
      { formula: 'ckd-epi-2021' },
    ).filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
    const umoll = appendComputedEgfr(
      // 1.0 mg/dl == 88.42 µmol/l -> must round-trip to the same eGFR
      [row({ bezeichnung: 'Kreatinin', einheit: 'µmol/l', wertNum: MGDL_PER_UMOLL, wert: '88,42' })],
      { formula: 'ckd-epi-2021', source: ['Kreatinin', 'µmol/l'] },
    ).filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
    expect(mgdl).toHaveLength(1)
    expect(umoll).toHaveLength(1)
    expect(umoll[0].wertNum).toBeCloseTo(mgdl[0].wertNum as number, 1)
  })

  it('converts each eligible selected µmol/l spelling and keeps the selected source pair isolated', () => {
    for (const [name, unit] of [['Kreatinin', 'µmol/l'], ['Creatinine serum', 'umol/L'], ['Kreatinin HP', 'μmol / l']]) {
      const rows = [
        row({ bezeichnung: name, einheit: unit, wertNum: 1.2 * MGDL_PER_UMOLL }),
        row({ bezeichnung: 'Kreatinin alternate', einheit: 'mg/dl', wertNum: 3.0 }),
      ]
      expect(creatinineSourceOptions(rows)).toContainEqual([name, unit])
      const computed = appendComputedEgfr(rows, { source: [name, unit] }).filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
      expect(computed).toHaveLength(1)
      expect(computed[0].wertNum).toBe(73.7) // CKD-EPI 2021, male, age 50, serum creatinine 1.2 mg/dl
    }
  })

  it('labels rows with the formula-specific computed name (MDRD-4)', () => {
    const out = appendComputedEgfr([row({ wertNum: 1.0 })], { formula: 'mdrd-4' })
    const computed = out.filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
    expect(computed).toHaveLength(1)
    expect(computed[0].bezeichnung).toBe('eGFR (MDRD-4, computed)')
    expect(computed[0].einheit).toBe('ml/min/1,73m²')
  })

  it('labels rows with the formula-specific computed name (EKFC 2021)', () => {
    const out = appendComputedEgfr([row({ wertNum: 1.0 })], { formula: 'ekfc-2021' })
    const computed = out.filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
    expect(computed).toHaveLength(1)
    expect(computed[0].bezeichnung).toBe('eGFR (EKFC 2021, computed)')
    expect(computed[0].wertNum).toBeCloseTo(86.1, 1)
  })

  it('labels rows with the formula-specific computed name (CKD-EPI 2009)', () => {
    const out = appendComputedEgfr([row({ wertNum: 1.2, patientAgeAtLab: 60 })], { formula: 'ckd-epi-2009' })
    const computed = out.filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
    expect(computed).toHaveLength(1)
    expect(computed[0].bezeichnung).toBe('eGFR (CKD-EPI 2009 (race-free), computed)')
    expect(computed[0].einheit).toBe('ml/min/1,73m²')
    expect(computed[0].wertNum).toBe(65.3)
  })

  it('defaults to the CKD-EPI 2021 formula when none is given', () => {
    const computed = appendComputedEgfr([row({ wertNum: 1.0 })])
      .filter((r) => r.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX))
    expect(computed[0].bezeichnung).toBe('eGFR (CKD-EPI 2021, computed)')
  })

  it('rejects an explicitly selected non-serum-creatinine source', () => {
    const rows = [row({ bezeichnung: 'Albumin/Kreatinin-Quotient', einheit: 'mg/g', wertNum: 30 })]
    expect(appendComputedEgfr(rows, { formula: 'ckd-epi-2021', source: ['Albumin/Kreatinin-Quotient', 'mg/g'] })).toBe(rows)
  })
})

// Decided 2026-11-21 (issue #65): one series per patient, the selected mg/dl
// source or, without any serum creatinine in mg/dl, the patient's µmol/l series.
describe('creatinine source per patient', () => {
  const MGDL: [string, string] = ['Kreatinin', 'mg/dl']
  const rows = [
    row({ patientId: 1, wertNum: 1.2, patientAgeAtLab: 60 }),
    row({ patientId: 1, einheit: 'µmol/l', wertNum: 300, patientAgeAtLab: 60 }),
    row({ patientId: 2, einheit: 'µmol/l', wertNum: 1.2 * MGDL_PER_UMOLL, patientAgeAtLab: 60 }),
    row({ patientId: 3, bezeichnung: 'Kreatinin HP', wertNum: 1.0 }),
    row({ patientId: 3, einheit: 'µmol/l', wertNum: 90 }),
    row({ patientId: 4, bezeichnung: 'Kreatinin A', einheit: 'µmol/l', wertNum: 90 }),
    row({ patientId: 4, bezeichnung: 'Kreatinin B', einheit: 'µmol/l', wertNum: 90 }),
    row({ patientId: 5, bezeichnung: 'Creatinine', einheit: 'umol/L', wertNum: 1.2 * MGDL_PER_UMOLL, patientAgeAtLab: 60 }),
    row({ patientId: 6, bezeichnung: 'HbA1c', einheit: '%', wertNum: 6 }),
  ]
  it('resolves each patient to one series or names why none', () => {
    const sources = patientCreatinineSources(rows, MGDL)
    expect(sources.get('1')).toMatchObject({ source: MGDL, fallback: false, gap: null, others: [['Kreatinin', 'µmol/l']] })
    expect(sources.get('2')).toMatchObject({ source: ['Kreatinin', 'µmol/l'], fallback: true, gap: null })
    expect(sources.get('3')).toMatchObject({ source: null, gap: 'other_mgdl' })
    expect(sources.get('4')).toMatchObject({ source: null, gap: 'several_umoll' })
    // The only µmol/l series, under another name than the selected source.
    expect(sources.get('5')).toMatchObject({ source: ['Creatinine', 'umol/L'], fallback: true })
    expect(sources.has('6')).toBe(false)
  })
  it('computes each patient from that series and records it, never merging', () => {
    const computed = appendComputedEgfr(rows, { formula: 'ckd-epi-2021', source: MGDL }).filter((r) => r.sourceSeries)
    expect(computed.map((r) => [r.patientId, r.wertNum, r.sourceSeries])).toEqual([
      // 1.2 mg/dl, male, 60: 69.2; the 300 µmol/l row of patient 1 is not used.
      [1, 69.2, { bezeichnung: 'Kreatinin', einheit: 'mg/dl' }],
      // 106.104 µmol/l = 1.2 mg/dl gives the same 69.2.
      [2, 69.2, { bezeichnung: 'Kreatinin', einheit: 'µmol/l' }],
      [5, 69.2, { bezeichnung: 'Creatinine', einheit: 'umol/L' }],
    ])
  })
  it('prefers the µmol/l series under the selected name when there are several', () => {
    const several = [
      row({ patientId: 7, bezeichnung: 'Kreatinin', einheit: 'µmol/l', wertNum: 90 }),
      row({ patientId: 7, bezeichnung: 'Kreatinin B', einheit: 'µmol/l', wertNum: 90 }),
    ]
    expect(patientCreatinineSources(several, MGDL).get('7')).toMatchObject({ source: ['Kreatinin', 'µmol/l'], fallback: true })
  })
  it('gives a selected µmol/l source no fallback, and an ineligible one no patient', () => {
    const sources = patientCreatinineSources(rows, ['Kreatinin', 'µmol/l'])
    expect(sources.get('1')!.source).toEqual(['Kreatinin', 'µmol/l'])
    expect(sources.get('3')).toMatchObject({ source: ['Kreatinin', 'µmol/l'] })
    expect(sources.get('5')).toMatchObject({ source: null, gap: 'no_source' })
    expect([...patientCreatinineSources(rows, ['Kreatinin', 'g/l']).values()].every((s) => s.source === null)).toBe(true)
  })
  it('takes the AKI windows of a fallback eGFR from the same µmol/l series', () => {
    // Patient 8: an AKI rise in "Kreatinin [µmol/l]" (the fallback, same name as
    // the selected source) and more, flat values in "Kreatinin X [µmol/l]".
    const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
    const aki = [['2020-01-01', 88], ['2020-01-02', 140], ['2020-02-01', 88]] as const
    const flat = ['2019-01-01', '2019-02-01', '2019-03-01', '2019-04-01', '2019-05-01']
    const input = [
      ...aki.map(([d, v]) => row({ patientId: 8, labDatum: day(d), einheit: 'µmol/l', wertNum: v })),
      ...flat.map((d) => row({ patientId: 8, labDatum: day(d), bezeichnung: 'Kreatinin X', einheit: 'µmol/l', wertNum: 88 })),
    ]
    const out = appendComputedEgfr(input, { formula: 'ckd-epi-2021', source: MGDL })
    const egfr = out.filter((r) => r.sourceSeries)
    expect(egfr).toHaveLength(3)
    expect(egfr.every((r) => r.sourceSeries!.bezeichnung === 'Kreatinin')).toBe(true)
    expect(episodesForSeries(out, 8, 'eGFR (CKD-EPI 2021, computed)', 'ml/min/1,73m²').map((e) => e.date.toISOString().slice(0, 10))).toEqual(['2020-01-02'])
  })
})
