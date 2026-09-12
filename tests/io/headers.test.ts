import { describe, it, expect } from 'vitest'
import {
  cell,
  checkRequiredColumns,
  collectHeaders,
  normaliseHeader,
  resolveColumns,
} from '../../src/io/headers'

describe('normaliseHeader', () => {
  it('trims, lowercases, and strips non-alphanumeric characters', () => {
    expect(normaliseHeader('PatientID')).toBe('patientid')
    expect(normaliseHeader('  patient_id  ')).toBe('patientid')
    expect(normaliseHeader('Patient-ID')).toBe('patientid')
    expect(normaliseHeader('Patient ID')).toBe('patientid')
    expect(normaliseHeader('Wert_num')).toBe('wertnum')
  })
})

describe('collectHeaders', () => {
  it('unions headers across all rows', () => {
    const rows = [
      { patientId: 1, labDate: '2024-01-01' },
      { patientId: 2, testName: 'Creatinine' },
    ]
    const headers = collectHeaders(rows)
    expect(headers).toEqual(new Set(['patientId', 'labDate', 'testName']))
  })

  it('returns empty set for empty rows', () => {
    expect(collectHeaders([])).toEqual(new Set())
  })
})

describe('resolveColumns', () => {
  const ALIASES = {
    patientId: ['patientId', 'PatientID', 'Patient Id', 'patient_id'],
    labDate: ['labDate', 'LabDatum'],
    value: ['value', 'Wert'],
  } as const

  it('resolves headers according to alias priority', () => {
    const resolved = resolveColumns(['PatientID', 'LabDatum', 'Wert'], ALIASES)
    expect(resolved.patientId).toBe('PatientID')
    expect(resolved.labDate).toBe('LabDatum')
    expect(resolved.value).toBe('Wert')
  })

  it('resolves canonical name when present', () => {
    const resolved = resolveColumns(['patientId', 'labDate', 'value'], ALIASES)
    expect(resolved.patientId).toBe('patientId')
    expect(resolved.labDate).toBe('labDate')
    expect(resolved.value).toBe('value')
  })

  it('matches case-insensitively and ignoring punctuation', () => {
    const resolved = resolveColumns(['patient_id', 'lab-date', 'VALUE'], ALIASES)
    expect(resolved.patientId).toBe('patient_id')
    expect(resolved.labDate).toBe('lab-date')
    expect(resolved.value).toBe('VALUE')
  })

  it('throws on ambiguous distinct headers that normalize to the same consumed alias', () => {
    expect(() =>
      resolveColumns(['Patient ID', 'patient_id'], ALIASES),
    ).toThrow(/Ambiguous columns.*"Patient ID".*"patient_id"/)
  })

  it('ignores collisions between unconsumed extra metadata columns', () => {
    const resolved = resolveColumns(
      ['patientId', 'labDate', 'value', 'extra_note', 'extra note'],
      ALIASES,
    )
    expect(resolved.patientId).toBe('patientId')
    expect(resolved.labDate).toBe('labDate')
    expect(resolved.value).toBe('value')
  })
})

describe('checkRequiredColumns', () => {
  it('passes when all required columns are present', () => {
    expect(() =>
      checkRequiredColumns(
        { patientId: 'PatientID', labDate: 'LabDatum' },
        ['patientId', 'labDate'],
        'Lab file',
      ),
    ).not.toThrow()
  })

  it('throws descriptive error when required columns are missing', () => {
    expect(() =>
      checkRequiredColumns(
        { patientId: 'PatientID' },
        ['patientId', 'labDate', 'testName'],
        'Event file',
      ),
    ).toThrow('Event file missing required column(s): patientId, labDate, testName.')
  })
})

describe('cell', () => {
  it('reads cell value using resolved header name', () => {
    const row = { 'Patient ID': 42, 'Lab Datum': '2024-01-01' }
    const resolved = { patientId: 'Patient ID', labDate: 'Lab Datum' }
    expect(cell(row, resolved, 'patientId')).toBe(42)
    expect(cell(row, resolved, 'labDate')).toBe('2024-01-01')
    expect(cell(row, resolved, 'missing' as any)).toBeUndefined()
  })
})
