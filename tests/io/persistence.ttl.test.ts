import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { set, get } from 'idb-keyval'
import { saveDataset, loadDataset, clearDataset, DATASET_TTL_MS } from '../../src/io/persistence'
import type { LabRow } from '../../src/core/types'

const KEY = 'lab-explorer:dataset'

function row(p: Partial<LabRow> = {}): LabRow {
  return {
    patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p,
  }
}

describe('dataset persistence TTL', () => {
  beforeEach(async () => { await clearDataset() })

  it('round-trips a freshly saved dataset', async () => {
    await saveDataset([row()], 'a.xlsx')
    const back = await loadDataset()
    expect(back?.rows).toHaveLength(1)
    expect(back?.fileName).toBe('a.xlsx')
  })

  it('discards (and clears) an entry older than the TTL', async () => {
    await set(KEY, { rows: [row()], fileName: 'old.xlsx', savedAt: Date.now() - DATASET_TTL_MS - 1000 })
    const back = await loadDataset()
    expect(back).toBeNull()
    expect(await get(KEY)).toBeUndefined() // stale data removed from disk
  })

  it('discards an entry with a missing/invalid timestamp', async () => {
    await set(KEY, { rows: [row()], fileName: 'x.xlsx', savedAt: NaN })
    expect(await loadDataset()).toBeNull()
  })
})
