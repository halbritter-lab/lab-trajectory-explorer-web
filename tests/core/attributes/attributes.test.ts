import { describe, expect, it } from 'vitest'
import {
  normalizePatientAttributes,
  patientAttributesExportRows,
  validatePatientAttributes,
} from '../../../src/core/attributes/attributes'
import type { LabRow, PatientId } from '../../../src/core/types'

function labRow(id: PatientId): LabRow {
  return {
    patientId: id,
    labDatum: new Date('2024-01-01'),
    bezeichnung: 'eGFR',
    einheit: 'ml/min/1,73m²',
    wert: '45',
    wertNum: 45,
    wertOperator: '=',
    loinc: null,
    patientSex: null,
    patientAgeAtLab: 60,
  }
}

describe('patient attributes - normalize', () => {
  it('parses rows into patient id + trimmed attribute map, omitting empty values', () => {
    const rows = [
      { patientId: 10, genotype: 'UMOD', sex: 'm', gout_age: '38' },
      { patientId: '11', genotype: '  MUC1 ', sex: 'w', gout_age: '' },
    ]

    expect(normalizePatientAttributes(rows)).toEqual([
      { patientId: 10, attributes: { genotype: 'UMOD', sex: 'm', gout_age: '38' } },
      { patientId: 11, attributes: { genotype: 'MUC1', sex: 'w' } },
    ])
  })

  it('returns an empty list for empty input', () => {
    expect(normalizePatientAttributes([])).toEqual([])
  })

  it('throws when the patientId column is missing', () => {
    const rows = [{ id: 1, genotype: 'UMOD' }]
    expect(() => normalizePatientAttributes(rows)).toThrow(
      'Patient attributes file missing required column: patientId.',
    )
  })

  it('throws when there are no attribute columns', () => {
    const rows = [{ patientId: 1 }]
    expect(() => normalizePatientAttributes(rows)).toThrow(
      'Patient attributes file has no attribute columns.',
    )
  })
})

describe('patient attributes - validate', () => {
  it('builds a byPatient map and marks known patients with no warning', () => {
    const records = normalizePatientAttributes([
      { patientId: 10, genotype: 'UMOD' },
      { patientId: 11, genotype: 'MUC1' },
    ])

    const result = validatePatientAttributes(records, [labRow(10), labRow(11)])

    expect(result.valid).toEqual([
      { patientId: 10, attributes: { genotype: 'UMOD' }, warning: '' },
      { patientId: 11, attributes: { genotype: 'MUC1' }, warning: '' },
    ])
    expect(result.byPatient).toEqual({
      '10': { genotype: 'UMOD' },
      '11': { genotype: 'MUC1' },
    })
    expect(result.rejected).toEqual([])
    expect(result.attributeNames).toEqual(['genotype'])
  })

  it('flags an unknown patient not present in the lab rows', () => {
    const records = normalizePatientAttributes([{ patientId: 99, genotype: 'UMOD' }])

    const result = validatePatientAttributes(records, [labRow(10)])

    expect(result.valid).toEqual([
      { patientId: 99, attributes: { genotype: 'UMOD' }, warning: 'unknown_patient' },
    ])
  })

  it('rejects a row with no patient id', () => {
    const records = normalizePatientAttributes([
      { patientId: '', genotype: 'UMOD' },
      { patientId: 11, genotype: 'MUC1' },
    ])

    const result = validatePatientAttributes(records, [labRow(11)])

    expect(result.rejected).toEqual([
      {
        row: { patientId: null, attributes: { genotype: 'UMOD' } },
        reason: 'missing_patient_id',
      },
    ])
    expect(result.valid.map((r) => r.patientId)).toEqual([11])
  })

  it('rejects a duplicate patient id and keeps the first row', () => {
    const records = normalizePatientAttributes([
      { patientId: 10, genotype: 'UMOD' },
      { patientId: 10, genotype: 'MUC1' },
    ])

    const result = validatePatientAttributes(records, [labRow(10)])

    expect(result.valid).toEqual([
      { patientId: 10, attributes: { genotype: 'UMOD' }, warning: '' },
    ])
    expect(result.rejected).toEqual([
      {
        row: { patientId: 10, attributes: { genotype: 'MUC1' } },
        reason: 'duplicate_patient',
      },
    ])
    expect(result.byPatient).toEqual({ '10': { genotype: 'UMOD' } })
  })

  it('collects attribute names as a sorted union across records', () => {
    const records = normalizePatientAttributes([
      { patientId: 10, genotype: 'UMOD', sex: 'm' },
      { patientId: 11, sex: 'w', gout_age: '40' },
    ])

    const result = validatePatientAttributes(records, [labRow(10), labRow(11)])

    expect(result.attributeNames).toEqual(['genotype', 'gout_age', 'sex'])
  })
})

describe('patient attributes - export rows', () => {
  it('builds rows with patientId first, numeric id order, and a sorted column union', () => {
    const rows = patientAttributesExportRows({
      '2': { sex: 'w', genotype: 'MUC1' },
      '10': { genotype: 'UMOD', gout_age: '38' },
    })

    expect(rows).toEqual([
      { patientId: '2', genotype: 'MUC1', gout_age: '', sex: 'w' },
      { patientId: '10', genotype: 'UMOD', gout_age: '38', sex: '' },
    ])
  })

  it('returns no rows when there are no attributes', () => {
    expect(patientAttributesExportRows({})).toEqual([])
  })
})
