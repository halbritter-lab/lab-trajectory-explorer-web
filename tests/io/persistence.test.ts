import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { saveDataset, loadDataset, clearDataset, hasSavedDataset } from '../../src/io/persistence'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-15'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('persistence', () => {
  beforeEach(async () => { await clearDataset() })

  it('reports no saved dataset initially', async () => {
    expect(await hasSavedDataset()).toBe(false)
    expect(await loadDataset()).toBeNull()
  })

  it('saves and loads a dataset, preserving Date fields', async () => {
    await saveDataset([row({ patientId: 7, labDatum: new Date('2021-06-01') })], 'file.xlsx')
    expect(await hasSavedDataset()).toBe(true)
    const loaded = await loadDataset()
    expect(loaded).not.toBeNull()
    expect(loaded!.rows).toHaveLength(1)
    expect(loaded!.rows[0].patientId).toBe(7)
    expect(loaded!.rows[0].labDatum instanceof Date).toBe(true)
    expect(loaded!.rows[0].labDatum!.getUTCFullYear()).toBe(2021)
    expect(loaded!.fileName).toBe('file.xlsx')
  })

  it('clears the saved dataset', async () => {
    await saveDataset([row({})], 'x.xlsx')
    await clearDataset()
    expect(await hasSavedDataset()).toBe(false)
    expect(await loadDataset()).toBeNull()
  })
})
