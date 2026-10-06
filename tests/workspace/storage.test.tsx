import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clear as clearDb, del as delDb, get as getDb, set as setDb, keys } from 'idb-keyval'
import { WorkspaceApp } from '../../src/workspace/WorkspaceApp'
import { useAppStore } from '../../src/workspace/state/store'
import type { LabRow } from '../../src/core/types'
import { DATASET_TTL_MS, startWorkspaceStorage, setWorkspaceRemember, useWorkspaceStorage, WORKSPACE_STORAGE_KEY, workspaceIdbStore } from '../../src/workspace/workspace-storage'

// The workspace keeps its copy in its own database; the default database is
// where earlier versions saved and other apps on the origin may still save.
const get = (key: string) => getDb(key, workspaceIdbStore())
const set = (key: string, value: unknown) => setDb(key, value, workspaceIdbStore())
const del = (key: string) => delDb(key, workspaceIdbStore())

const row: LabRow = { patientId: 'A', labDatum: new Date('2020-01-01'), bezeichnung: 'Marker', einheit: 'u', wert: '60', wertNum: 60, wertOperator: '=', loinc: null, patientSex: 'm', patientAgeAtLab: 50 }
let stop: (() => void) | undefined
beforeEach(async () => {
  await clearDb(); await clearDb(workspaceIdbStore()); useAppStore.getState().reset()
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  stop = await startWorkspaceStorage()
})
afterEach(async () => { stop?.(); await act(async () => { await setWorkspaceRemember(false) }); vi.restoreAllMocks() })

describe('workspace local storage', () => {
  it('allows opting into storage from Data', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
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
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
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
    useAppStore.getState().replaceDataset({ rows: [row] })
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
    useAppStore.getState().replaceDataset({ rows: [row] })
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
    useAppStore.getState().replaceDataset({ rows: [row] })
    await setWorkspaceRemember(true)
    const saved = await get(WORKSPACE_STORAGE_KEY)
    stop?.(); useAppStore.getState().reset()
    await set(WORKSPACE_STORAGE_KEY, { ...saved, savedAt: Date.now() - DATASET_TTL_MS - 1 })
    stop = await startWorkspaceStorage()
    expect(useAppStore.getState().rows).toHaveLength(0)
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    expect(useWorkspaceStorage.getState().message).toMatch(/expired/)
  })
  it('removes a malformed saved copy without replacing the live data', async () => {
    useAppStore.getState().replaceDataset({ rows: [row] })
    await setWorkspaceRemember(true)
    const saved = await get(WORKSPACE_STORAGE_KEY)
    stop?.()
    await set(WORKSPACE_STORAGE_KEY, { ...saved, rows: [{ ...row, labDatum: 'not a date' }] })
    stop = await startWorkspaceStorage()
    expect(useAppStore.getState().rows[0].labDatum).toEqual(new Date('2020-01-01'))
    expect(useWorkspaceStorage.getState().enabled).toBe(false)
    expect(useWorkspaceStorage.getState().message).toMatch(/could not be read .* and was removed/)
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
  })
  it('checks expiry before the schema, so an expired copy of any shape is removed as expired', async () => {
    stop?.()
    await set(WORKSPACE_STORAGE_KEY, { version: 0, savedAt: Date.now() - DATASET_TTL_MS - 1, rows: 'unsupported' })
    stop = await startWorkspaceStorage()
    expect(useWorkspaceStorage.getState().message).toMatch(/expired after seven days and was removed/)
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
  })
  it('removes an unsupported version even if it is recent', async () => {
    stop?.()
    await set(WORKSPACE_STORAGE_KEY, { version: 2, savedAt: Date.now(), writeToken: 'x', rows: [row] })
    stop = await startWorkspaceStorage()
    expect(useAppStore.getState().rows).toHaveLength(0)
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
  })
  it('cannot recreate a snapshot removed by another tab', async () => {
    useAppStore.getState().replaceDataset({ rows: [row] })
    await setWorkspaceRemember(true)
    await del(WORKSPACE_STORAGE_KEY)
    useAppStore.getState().setManualDemographics('A', { age: 41 })
    await waitFor(() => expect(useWorkspaceStorage.getState().status).not.toBe('saving'))
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    expect(useWorkspaceStorage.getState().enabled).toBe(false)
    expect(useWorkspaceStorage.getState().message).toMatch(/another tab/)
  })
  it('does not overwrite a newer snapshot written by another tab', async () => {
    useAppStore.getState().replaceDataset({ rows: [row] })
    await setWorkspaceRemember(true)
    const newer = { ...await get(WORKSPACE_STORAGE_KEY), writeToken: 'another-tab', fileName: 'newer.csv' }
    await set(WORKSPACE_STORAGE_KEY, newer)
    useAppStore.getState().setManualDemographics('A', { age: 41 })
    await waitFor(() => expect(useWorkspaceStorage.getState().status).not.toBe('saving'))
    expect((await get(WORKSPACE_STORAGE_KEY)).fileName).toBe('newer.csv')
    expect(useWorkspaceStorage.getState().enabled).toBe(false)
  })
  it('keeps live data usable and reports a failed save', async () => {
    useAppStore.getState().replaceDataset({ rows: [row] })
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const blocked = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    stop = await startWorkspaceStorage()
    blocked.mockRestore()
    expect(useWorkspaceStorage.getState().status).toBe('error')
    expect(warn).toHaveBeenCalled()
    useAppStore.getState().replaceDataset({ rows: [row] })
    expect(useAppStore.getState().rows).toHaveLength(1)
  })

})

describe('storage left by earlier versions', () => {
  // A snapshot as the previous release wrote it to idb-keyval's default database.
  const previousSnapshot = () => ({
    version: 1, writeToken: 'previous-release', savedAt: Date.now() - 60_000, rows: [row], fileName: 'earlier.csv',
    events: [], patientAttributes: { A: { genotype: 'G1' } }, manualDemographics: {},
    analysisSettings: { egfr: { formula: 'mdrd-4', source: null }, aki: { showOverlays: true, exclusionDays: 30 }, rapidEgfrDecline: { threshold: 5 } },
  })
  async function restart() { stop?.(); useAppStore.getState().reset(); stop = await startWorkspaceStorage() }

  it('moves a usable workspace copy from the shared database once and removes the source', async () => {
    await setDb(WORKSPACE_STORAGE_KEY, previousSnapshot())
    await restart()
    expect(useAppStore.getState()).toMatchObject({ fileName: 'earlier.csv', patientAttributes: { A: { genotype: 'G1' } } })
    expect(useAppStore.getState().analysisSettings.egfr.formula).toBe('mdrd-4')
    expect(useWorkspaceStorage.getState()).toMatchObject({ enabled: true, status: 'saved', legacyDataRemoved: false })
    expect(await getDb(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    expect((await get(WORKSPACE_STORAGE_KEY)).writeToken).toBe('previous-release')
    // Saving continues in the dedicated database with the migrated token.
    useAppStore.getState().setManualDemographics('A', { age: 44 })
    await waitFor(() => expect(useWorkspaceStorage.getState().status).toBe('saved'))
    expect((await get(WORKSPACE_STORAGE_KEY)).manualDemographics.A).toEqual({ age: 44 })
    expect(await getDb(WORKSPACE_STORAGE_KEY)).toBeUndefined()
  })
  it('does not migrate an expired copy and never overwrites the dedicated copy', async () => {
    await setDb(WORKSPACE_STORAGE_KEY, { ...previousSnapshot(), savedAt: Date.now() - DATASET_TTL_MS - 1 })
    await restart()
    expect(useAppStore.getState().rows).toHaveLength(0)
    expect(await getDb(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()

    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'current.csv' })
    await setWorkspaceRemember(true)
    await setDb(WORKSPACE_STORAGE_KEY, previousSnapshot())
    await restart()
    expect(useAppStore.getState().fileName).toBe('current.csv')
    expect(await getDb(WORKSPACE_STORAGE_KEY)).toBeUndefined()
  })
  it('removes the former interface data regardless of age, tells the user once and leaves other apps alone', async () => {
    await setDb('lab-explorer:dataset', { rows: [row], fileName: 'old.xlsx', savedAt: Date.now() })
    await setDb('lab-explorer:settings', { cohortZoom: 'm' })
    await setDb('lab-explorer:something-else', 1)
    await setDb('another-app:state', 'keep me')
    await restart()
    expect(useAppStore.getState().rows).toHaveLength(0)
    expect(useWorkspaceStorage.getState().legacyDataRemoved).toBe(true)
    expect(await keys()).toEqual(['another-app:state'])
    render(<WorkspaceApp />)
    expect(screen.getByText(/or settings saved on this device by the former version of Lab Trajectory Explorer were removed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/former version/)).not.toBeInTheDocument()
    await restart()
    expect(useWorkspaceStorage.getState().legacyDataRemoved).toBe(false)
  })
})
