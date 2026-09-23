import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clear, del, get, set } from 'idb-keyval'
import { WorkspaceApp } from '../../src/workspace/WorkspaceApp'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'
import { startWorkspaceStorage, setWorkspaceRemember, useWorkspaceStorage, WORKSPACE_STORAGE_KEY } from '../../src/workspace/workspace-storage'
import { DATASET_TTL_MS } from '../../src/io/persistence'

const row: LabRow = { patientId: 'A', labDatum: new Date('2020-01-01'), bezeichnung: 'Marker', einheit: 'u', wert: '60', wertNum: 60, wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: 50 }
let stop: (() => void) | undefined
beforeEach(async () => {
  await clear(); useAppStore.getState().reset()
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  stop = await startWorkspaceStorage()
})
afterEach(async () => { stop?.(); await act(async () => { await setWorkspaceRemember(false) }); vi.restoreAllMocks() })

describe('workspace local storage', () => {
  it('allows opting into storage from Data', async () => {
    useAppStore.getState().setDataset([row], 'input.csv')
    render(<WorkspaceApp />)
    expect(screen.getByRole('checkbox', { name: 'Remember on this device' })).not.toBeChecked()
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Remember on this device' })); await new Promise(resolve => setTimeout(resolve, 20)) })
    await waitFor(() => expect(useWorkspaceStorage.getState().status).toBe('saved'))
    expect((await get(WORKSPACE_STORAGE_KEY)).rows[0].patientId).toBe('A')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' })); await new Promise(resolve => setTimeout(resolve, 20)) })
    await waitFor(() => expect(useWorkspaceStorage.getState().status).toBe('session'))
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    expect(useAppStore.getState().rows).toHaveLength(1)
  })
  it('restores labs, events, attributes, manual edits and derivation settings together', async () => {
    useAppStore.getState().setDataset([row], 'input.csv')
    useAppStore.setState({
      events: [{ patientId: 'A', type: 'other', date: new Date('2020-02-01'), endDate: null, title: 'Study', description: null, intent: null, warning: '' }],
      patientAttributes: { A: { genotype: 'G1' } }, manualDemographics: { A: { age: 42, sex: 'w' } },
    })
    useAppStore.getState().setEgfrFormula('mdrd-4')
    await setWorkspaceRemember(true)
    stop?.()
    useAppStore.getState().reset()
    stop = await startWorkspaceStorage()
    const restored = useAppStore.getState()
    expect(restored.rows[0].labDatum).toEqual(new Date('2020-01-01'))
    expect(restored.fileName).toBe('input.csv')
    expect(restored.events[0].date).toEqual(new Date('2020-02-01'))
    expect(restored.patientAttributes.A.genotype).toBe('G1')
    expect(restored.manualDemographics.A).toEqual({ age: 42, sex: 'w' })
    expect(restored.analysisSettings.egfr.formula).toBe('mdrd-4')
    expect(restored.cohortModelResults).toBeNull()
    expect(useWorkspaceStorage.getState().enabled).toBe(true)
  })
  it('clears current and saved data only after confirming the dataset reset', async () => {
    useAppStore.getState().setDataset([row])
    await setWorkspaceRemember(true)
    render(<WorkspaceApp />)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Clear dataset' }))
    expect(useAppStore.getState().rows).toHaveLength(1)
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Clear dataset' }))
    expect(useAppStore.getState().busy).toBe(true)
    expect(screen.getByLabelText('Import lab values')).toBeDisabled()
    await waitFor(() => expect(useAppStore.getState().rows).toHaveLength(0))
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
  })
  it('saves supplementary changes and leaves no queued save after opting out', async () => {
    useAppStore.getState().setDataset([row])
    await setWorkspaceRemember(true)
    useAppStore.setState({ patientAttributes: { A: { genotype: 'updated' } } })
    await waitFor(() => expect(useWorkspaceStorage.getState().status).toBe('saved'))
    expect((await get(WORKSPACE_STORAGE_KEY)).patientAttributes.A.genotype).toBe('updated')
    useAppStore.setState({ rows: [{ ...row, wertNum: 12 }] })
    await setWorkspaceRemember(false)
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    useAppStore.setState({ rows: [{ ...row, wertNum: 13 }] })
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
  })
  it('expires saved data without refreshing the timestamp during restore', async () => {
    useAppStore.getState().setDataset([row])
    await setWorkspaceRemember(true)
    const saved = await get(WORKSPACE_STORAGE_KEY)
    stop?.(); useAppStore.getState().reset()
    await set(WORKSPACE_STORAGE_KEY, { ...saved, savedAt: Date.now() - DATASET_TTL_MS - 1 })
    stop = await startWorkspaceStorage()
    expect(useAppStore.getState().rows).toHaveLength(0)
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    expect(useWorkspaceStorage.getState().message).toMatch(/expired/)
  })
  it('rejects malformed saved dates without replacing the live data', async () => {
    useAppStore.getState().setDataset([row])
    await setWorkspaceRemember(true)
    const saved = await get(WORKSPACE_STORAGE_KEY)
    stop?.()
    await set(WORKSPACE_STORAGE_KEY, { ...saved, rows: [{ ...row, labDatum: 'not a date' }] })
    stop = await startWorkspaceStorage()
    expect(useAppStore.getState().rows[0].labDatum).toEqual(new Date('2020-01-01'))
    expect(useWorkspaceStorage.getState().status).toBe('error')
    expect(useWorkspaceStorage.getState().enabled).toBe(false)
  })
  it('cannot recreate a snapshot removed by another tab', async () => {
    useAppStore.getState().setDataset([row])
    await setWorkspaceRemember(true)
    await del(WORKSPACE_STORAGE_KEY)
    useAppStore.getState().setManualDemographics('A', { age: 41 })
    await waitFor(() => expect(useWorkspaceStorage.getState().status).not.toBe('saving'))
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    expect(useWorkspaceStorage.getState().enabled).toBe(false)
    expect(useWorkspaceStorage.getState().message).toMatch(/another tab/)
  })
  it('does not overwrite a newer snapshot written by another tab', async () => {
    useAppStore.getState().setDataset([row])
    await setWorkspaceRemember(true)
    const newer = { ...await get(WORKSPACE_STORAGE_KEY), writeToken: 'another-tab', fileName: 'newer.csv' }
    await set(WORKSPACE_STORAGE_KEY, newer)
    useAppStore.getState().setManualDemographics('A', { age: 41 })
    await waitFor(() => expect(useWorkspaceStorage.getState().status).not.toBe('saving'))
    expect((await get(WORKSPACE_STORAGE_KEY)).fileName).toBe('newer.csv')
    expect(useWorkspaceStorage.getState().enabled).toBe(false)
  })
  it('keeps live data usable and reports a failed save', async () => {
    useAppStore.getState().setDataset([row])
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => { throw new DOMException('quota', 'QuotaExceededError') })
    await setWorkspaceRemember(true)
    expect(useWorkspaceStorage.getState().status).toBe('error')
    expect(useAppStore.getState().rows).toHaveLength(1)
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    await setWorkspaceRemember(true)
    expect(useWorkspaceStorage.getState().status).toBe('saved')
  })
  it('starts without saved data when browser storage access fails', async () => {
    stop?.()
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => { throw new DOMException('blocked', 'SecurityError') })
    stop = await startWorkspaceStorage()
    expect(useWorkspaceStorage.getState().status).toBe('error')
    useAppStore.getState().setDataset([row])
    expect(useAppStore.getState().rows).toHaveLength(1)
  })
})
