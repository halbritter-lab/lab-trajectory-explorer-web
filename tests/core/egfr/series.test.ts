import { describe, it, expect } from 'vitest'
import { creatinineSourceOptions, allSourceOptions, defaultCreatinineSource, appendComputedEgfr, MGDL_PER_UMOLL, COMPUTED_BEZEICHNUNG_SUFFIX } from '../../../src/core/egfr/series'
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

describe('allSourceOptions', () => {
  it('lists all distinct source pairs for manual picker override', () => {
    const rows = [
      row({ bezeichnung: 'Kreatinin', einheit: 'mg/dl' }),
      row({ bezeichnung: 'Albumin/Kreatinin-Quotient', einheit: 'mg/g' }),
      row({ bezeichnung: 'Kreatinin', einheit: 'mg/dl', wertNum: 1.2 }),
    ]
    expect(allSourceOptions(rows)).toEqual([
      ['Albumin/Kreatinin-Quotient', 'mg/g'],
      ['Kreatinin', 'mg/dl'],
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
