import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../src/ui/state/store'
import type { LabRow } from '../../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('useAppStore', () => {
  beforeEach(() => useAppStore.getState().reset())

  it('starts empty', () => {
    expect(useAppStore.getState().rows).toEqual([])
    expect(useAppStore.getState().selectedPatientId).toBeNull()
    expect(useAppStore.getState().cohortSort).toEqual({ key: 'id', dir: 'asc' })
  })

  it('setDataset stores rows and auto-selects the first patient', () => {
    useAppStore.getState().setDataset([row({ patientId: 7 }), row({ patientId: 9 })])
    expect(useAppStore.getState().rows).toHaveLength(2)
    expect(useAppStore.getState().selectedPatientId).toBe(7)
  })

  it('setDataset opens the cohort view by default after loading data', () => {
    useAppStore.getState().setView('one')
    useAppStore.getState().setDataset([row({ patientId: 7 }), row({ patientId: 9 })])
    expect(useAppStore.getState().view).toBe('cohort')
  })

  it('patientIds returns sorted unique ids', () => {
    useAppStore.getState().setDataset([row({ patientId: 9 }), row({ patientId: 7 }), row({ patientId: 9 })])
    expect(useAppStore.getState().patientIds()).toEqual([7, 9])
  })

  it('selectPatient and setView mutate state', () => {
    useAppStore.getState().setDataset([row({ patientId: 7 })])
    useAppStore.getState().selectPatient(7)
    useAppStore.getState().setView('cohort')
    expect(useAppStore.getState().selectedPatientId).toBe(7)
    expect(useAppStore.getState().view).toBe('cohort')
  })
})

describe('loadFile feedback', () => {
  beforeEach(() => useAppStore.getState().reset())

  function fileFrom(bytes: Uint8Array, name: string): File {
    // jsdom File.arrayBuffer is unreliable; stub it to return the bytes.
    const f = new File([], name)
    Object.defineProperty(f, 'arrayBuffer', { value: async () => bytes.buffer })
    return f
  }

  it('sets an error notice (and does not crash) on an unreadable file', async () => {
    await useAppStore.getState().loadFile(fileFrom(new Uint8Array([1, 2, 3, 4]), 'bad.xlsx'))
    const { notice, busy, rows } = useAppStore.getState()
    expect(busy).toBe(false)
    expect(rows).toHaveLength(0)
    expect(notice?.kind).toBe('error')
  })
})

describe('cohort zoom + exclusion days', () => {
  it('defaults cohortZoom to m and updates via setCohortZoom', () => {
    useAppStore.getState().reset()
    expect(useAppStore.getState().cohortZoom).toBe('m')
    useAppStore.getState().setCohortZoom('l')
    expect(useAppStore.getState().cohortZoom).toBe('l')
    useAppStore.getState().reset()
    expect(useAppStore.getState().cohortZoom).toBe('m')
  })
  it('series configs carry exclusionDays (default 30)', () => {
    useAppStore.getState().reset()
    expect(useAppStore.getState().seriesConfigs[0].exclusionDays).toBe(30)
    useAppStore.getState().setSeriesConfig(0, { mode: 'aki-aware', exclusionDays: 14 })
    expect(useAppStore.getState().seriesConfigs[0].exclusionDays).toBe(14)
  })
})
