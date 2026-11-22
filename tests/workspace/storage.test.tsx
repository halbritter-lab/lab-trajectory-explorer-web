import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clear as clearDb, del as delDb, get as getDb, set as setDb, keys } from 'idb-keyval'
import { WorkspaceApp } from '../../src/workspace/WorkspaceApp'
import { WorkspaceStorageControls } from '../../src/workspace/WorkspaceStorageControls'
import { useAppStore } from '../../src/workspace/state/store'
import type { LabRow } from '../../src/core/types'
import { defaultTrajectoryView, losesDataOnUnload } from '../../src/workspace/saved-settings'
import { defaultFitSettings, defaultTrajectoryFitSettings } from '../../src/workspace/workspace-analysis'
import { checkSavedCopy, DATASET_TTL_MS, restoredNotice, savedStatusText, startWorkspaceStorage, setWorkspaceRemember, useWorkspaceStorage, WORKSPACE_SETTINGS_KEY, WORKSPACE_STORAGE_KEY, workspaceIdbStore } from '../../src/workspace/workspace-storage'

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
    expect(restored.notice?.text).toBe('Dataset and analysis settings (presets, trend and display choices) restored from this device. Cohort model settings and results are not saved: fit the models again under Cohort models.')
    expect(restored.events[0].date).toEqual(new Date('2020-02-01'))
    expect(restored.patientAttributes.A.genotype).toBe('G1')
    expect(restored.manualDemographics.A).toEqual({ age: 42, sex: 'w' })
    expect(restored.analysisSettings.egfr.formula).toBe('mdrd-4')
    expect(restored.cohortModelResults).toBeNull()
    expect(useWorkspaceStorage.getState().enabled).toBe(true)
  })
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  const restart = async () => { stop?.(); useAppStore.getState().reset(); stop = await startWorkspaceStorage() }
  it('saves the import diagnostics of every source with the dataset and restores them', async () => {
    const labs = [
      { source: 'labs' as const, sheet: 'input.csv', patientId: null, severity: 'rejected' as const, row: 7, reason: 'Patient ID missing; row not imported.' },
      { source: 'labs' as const, sheet: 'input.csv', patientId: null, severity: 'warning' as const, scope: 'sheet' as const, reason: '1 duplicate lab row.', rows: [{ row: 3, patientId: 'A', date: '2020-01-01', parameter: 'Marker [u]', value: '60' }] },
    ]
    useAppStore.getState().replaceDataset({ rows: [{ ...row, sourceRow: 2 }], fileName: 'input.csv', importDiagnostics: labs })
    await setWorkspaceRemember(true)
    // A later attributes import adds its findings and is saved without touching the lab findings.
    const attributes = [{ source: 'attributes' as const, sheet: 'attr.csv', patientId: 'B', severity: 'rejected' as const, row: 4, reason: 'Patient B already has an attribute row; this later row is not imported.' }]
    act(() => { useAppStore.getState().setImportDiagnostics('attributes', attributes) })
    await settle()
    await waitFor(() => expect(useWorkspaceStorage.getState().status).toBe('saved'))
    expect((await get(WORKSPACE_STORAGE_KEY)).importDiagnostics).toEqual([...labs, ...attributes])
    await restart()
    expect(useAppStore.getState().importDiagnostics).toEqual([...labs, ...attributes])
    expect(useAppStore.getState().rows[0].sourceRow).toBe(2)
    expect(useAppStore.getState().notice?.text).toMatch(/^Dataset and analysis settings/)
  })
  it('saves the peri-event creatinine selection with the dataset and restores it; an unreadable one restores as none', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    const selection = { rule: { kind: 'title' as const, value: 'Contrast CT' }, windowHours: 72 as const }
    act(() => { useAppStore.getState().setPeriEventSettings(selection) })
    await settle()
    await waitFor(() => expect(useWorkspaceStorage.getState().status).toBe('saved'))
    expect((await get(WORKSPACE_STORAGE_KEY)).periEventSettings).toEqual(selection)
    await restart()
    expect(useAppStore.getState().periEventSettings).toEqual(selection)
    await set(WORKSPACE_STORAGE_KEY, { ...(await get(WORKSPACE_STORAGE_KEY)), periEventSettings: { rule: selection.rule, windowHours: 24 } })
    await restart()
    expect(useAppStore.getState().rows).toHaveLength(1)
    expect(useAppStore.getState().periEventSettings).toBeNull()
  })
  it('restores a copy saved without import diagnostics, and drops entries it cannot read', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    const copy = await get(WORKSPACE_STORAGE_KEY)
    delete copy.importDiagnostics
    await set(WORKSPACE_STORAGE_KEY, copy)
    await restart()
    expect(useAppStore.getState().rows).toHaveLength(1)
    expect(useAppStore.getState().importDiagnostics).toEqual([])
    const valid = { source: 'events', sheet: 'events.csv', patientId: 'A', severity: 'rejected', row: 2, reason: 'Event date is not a valid date; row not imported.' }
    await set(WORKSPACE_STORAGE_KEY, { ...(await get(WORKSPACE_STORAGE_KEY)), importDiagnostics: [valid, { source: 'elsewhere', reason: 'x' }, 'text', { ...valid, rows: [{ row: 'two' }] }] })
    await restart()
    expect(useAppStore.getState().rows).toHaveLength(1)
    expect(useAppStore.getState().importDiagnostics).toEqual([valid])
  })
  // Review finding 2026-11-21: a copy saved by the version before the LOINC rule kept urine
  // creatinine inside the serum series (AKI detection, eGFR) and the notice said nothing.
  it('applies the urine LOINC rule to a copy saved by an earlier version and says what that copy lacks', async () => {
    const crea = (date: string, value: number, loinc: string): LabRow => ({ ...row, labDatum: new Date(date), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: String(value), wertNum: value, loinc })
    useAppStore.getState().replaceDataset({ rows: [crea('2020-01-01', 1, '2160-0'), crea('2020-01-01', 4.4, '2161-8'), crea('2020-06-01', 1.1, '2160-0'), crea('2020-06-01', 5, ' 14683-7 ')], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    // The shape the version before 2026-11-21 wrote: no import findings.
    const copy = await get(WORKSPACE_STORAGE_KEY)
    delete copy.importDiagnostics
    await set(WORKSPACE_STORAGE_KEY, copy)
    await restart()
    const state = useAppStore.getState()
    expect(state.rows.map(r => r.bezeichnung)).toEqual(['Kreatinin', 'Kreatinin (urine, LOINC 2161-8)', 'Kreatinin', 'Kreatinin (urine, LOINC 14683-7)'])
    expect(state.rows.map(r => r.loinc)).toEqual(['2160-0', '2161-8', '2160-0', ' 14683-7 '])
    expect(state.notice?.text).toContain('This copy was saved by an earlier version: it has no import findings, no source rows and no times of day')
    expect(state.notice?.text).toContain('2 creatinine values with a urine LOINC code (2161-8, 14683-7) were moved to a parameter of their own, as an import does: not used for AKI detection or eGFR.')
    // The next data change saves the copy in the current shape: nothing left to report.
    act(() => useAppStore.getState().setEvents([]))
    await waitFor(async () => expect((await get(WORKSPACE_STORAGE_KEY)).rows[1].bezeichnung).toBe('Kreatinin (urine, LOINC 2161-8)'))
    await restart()
    expect(useAppStore.getState().rows.map(r => r.bezeichnung)).toEqual(['Kreatinin', 'Kreatinin (urine, LOINC 2161-8)', 'Kreatinin', 'Kreatinin (urine, LOINC 14683-7)'])
    expect(useAppStore.getState().notice?.text).not.toMatch(/earlier version|urine LOINC/)
  })
  it('saves and restores the Trajectories analysis settings in their own record', async () => {
    const key = JSON.stringify(['Marker', 'u'])
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    const fit = { shared: defaultFitSettings(), columns: { [key]: defaultFitSettings('ckd_progression') } }
    const view = { ...defaultTrajectoryView(), parameterKeys: [key], trendKeys: [key], fitKeys: [key], axis: 'age' as const, display: { events: true } }
    act(() => { useAppStore.getState().setTrajectoryFitSettings(fit); useAppStore.getState().setTrajectoryView(view) })
    await settle()
    const copy = await get(WORKSPACE_STORAGE_KEY)
    expect(copy.settings).toBeUndefined()
    expect(await get(WORKSPACE_SETTINGS_KEY)).toEqual({ version: 1, datasetToken: copy.writeToken, trajectoryFitSettings: fit, trajectoryView: view })
    await restart()
    expect(useAppStore.getState().trajectoryFitSettings).toEqual(fit)
    expect(useAppStore.getState().trajectoryView).toEqual(view)
    // Clearing the saved copy removes the settings with it.
    await act(async () => { await setWorkspaceRemember(false) })
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    expect(await get(WORKSPACE_SETTINGS_KEY)).toBeUndefined()
  })
  it('does not touch the dataset copy when only analysis settings change', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    const before = await get(WORKSPACE_STORAGE_KEY)
    const statuses: string[] = []
    const watch = useWorkspaceStorage.subscribe(state => statuses.push(state.status))
    act(() => { useAppStore.getState().setTrajectoryView({ ...defaultTrajectoryView(), chartSize: 'large' }) })
    await settle()
    watch()
    const after = await get(WORKSPACE_STORAGE_KEY)
    // The seven days run from the last data change, and other tabs see the same copy.
    expect(after.savedAt).toBe(before.savedAt)
    expect(after.writeToken).toBe(before.writeToken)
    expect((await get(WORKSPACE_SETTINGS_KEY)).trajectoryView.chartSize).toBe('large')
    // The dataset stays "saved" throughout, so the leave-page question does not appear.
    expect(statuses).toEqual([])
  })
  it('does not refresh the expiry when a copy is restored with the workspace mounted', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    // A copy from before settings were kept: no settings record.
    await del(WORKSPACE_SETTINGS_KEY)
    const before = await get(WORKSPACE_STORAGE_KEY)
    await restart()
    const view = render(<WorkspaceApp />)
    await settle()
    // Mounting writes nothing at all: no settings record appears.
    expect(await get(WORKSPACE_SETTINGS_KEY)).toBeUndefined()
    const after = await get(WORKSPACE_STORAGE_KEY)
    expect(after.savedAt).toBe(before.savedAt)
    expect(after.writeToken).toBe(before.writeToken)
    view.unmount()
  })
  it('does not overwrite settings of another version merely because the page mounted', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    const theirs = { ...await get(WORKSPACE_SETTINGS_KEY), version: 99, trajectoryView: { ...defaultTrajectoryView(), axis: 'age' } }
    await set(WORKSPACE_SETTINGS_KEY, theirs)
    await restart()
    const view = render(<WorkspaceApp />)
    await settle()
    expect(await get(WORKSPACE_SETTINGS_KEY)).toEqual(theirs)
    view.unmount()
  })
  it('gives a copy that was saved without settings its settings with the first change', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    const copy = await get(WORKSPACE_STORAGE_KEY)
    // As a 0.3.7 tab or the migration of an earlier copy leaves it: data without a settings record,
    // or with the record of a copy that no longer exists.
    for (const leftover of [undefined, { ...await get(WORKSPACE_SETTINGS_KEY), datasetToken: 'a-copy-that-is-gone' }]) {
      if (leftover) await set(WORKSPACE_SETTINGS_KEY, leftover); else await del(WORKSPACE_SETTINGS_KEY)
      const chartSize = leftover ? 'medium' : 'large'
      act(() => { useAppStore.getState().setTrajectoryView({ ...defaultTrajectoryView(), chartSize }) })
      await settle()
      expect(await get(WORKSPACE_SETTINGS_KEY)).toMatchObject({ datasetToken: copy.writeToken, trajectoryView: { chartSize } })
      await restart()
      expect(useAppStore.getState().trajectoryView.chartSize).toBe(chartSize)
    }
    expect((await get(WORKSPACE_STORAGE_KEY)).savedAt).toBe(copy.savedAt)
  })
  it('reports a failed settings write on its own and clears it with the next successful one', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    const before = await get(WORKSPACE_STORAGE_KEY)
    // A function cannot be stored, so this settings write fails.
    act(() => { useAppStore.setState({ trajectoryView: { ...defaultTrajectoryView(), display: { events: (() => true) as never } } }) })
    await settle()
    // The dataset is saved and says so: no "Retry saving" that would rewrite it, no leave-page question.
    expect(useWorkspaceStorage.getState()).toMatchObject({ enabled: true, status: 'saved', message: null })
    expect(useWorkspaceStorage.getState().settingsError).toMatch(/^Could not save the analysis settings on this device\. The dataset copy is unchanged/)
    const controls = render(<WorkspaceStorageControls hasData />)
    expect(screen.getByText(/^Could not save the analysis settings on this device/)).toBeInTheDocument()
    expect(screen.getByText(/^Saved on \d{4}-\d\d-\d\d \d\d:\d\d; removed when the app is next opened after /)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry saving' })).toBeNull()
    controls.unmount()
    act(() => { useAppStore.getState().setTrajectoryView({ ...defaultTrajectoryView(), chartSize: 'large' }) })
    await settle()
    expect(useWorkspaceStorage.getState().settingsError).toBeNull()
    expect((await get(WORKSPACE_SETTINGS_KEY)).trajectoryView.chartSize).toBe('large')
    expect((await get(WORKSPACE_STORAGE_KEY)).savedAt).toBe(before.savedAt)
  })
  it('commits neither record when the settings cannot be written with the data', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    const before = await get(WORKSPACE_STORAGE_KEY)
    act(() => { useAppStore.setState({ trajectoryView: { ...defaultTrajectoryView(), display: { events: (() => true) as never } } }) })
    await settle()
    act(() => { useAppStore.getState().setEvents([]) })
    await waitFor(() => expect(useWorkspaceStorage.getState().status).toBe('error'))
    expect((await get(WORKSPACE_STORAGE_KEY)).writeToken).toBe(before.writeToken)
    // With storable settings the retry saves; it is not mistaken for another tab's copy.
    act(() => { useAppStore.setState({ trajectoryView: defaultTrajectoryView() }) })
    await act(async () => { await setWorkspaceRemember(true) })
    expect(useWorkspaceStorage.getState()).toMatchObject({ enabled: true, status: 'saved', message: null })
    expect((await get(WORKSPACE_STORAGE_KEY)).writeToken).not.toBe(before.writeToken)
  })
  it('never treats a copy restored from this device as the pristine demo', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'test_labs.xlsx (Demo)', pristineDemo: true })
    expect(losesDataOnUnload(true, useWorkspaceStorage.getState(), useAppStore.getState().pristineDemo)).toBe(false)
    // Events imported on top, remembered, reloaded, then the saved copy is cleared.
    act(() => { useAppStore.getState().setEvents([]) })
    await setWorkspaceRemember(true)
    await restart()
    expect(useAppStore.getState().pristineDemo).toBe(false)
    await act(async () => { await setWorkspaceRemember(false) })
    expect(losesDataOnUnload(true, useWorkspaceStorage.getState(), useAppStore.getState().pristineDemo)).toBe(true)
    // Also without an import on top: what was restored is the user's saved copy.
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'test_labs.xlsx (Demo)', pristineDemo: true })
    await setWorkspaceRemember(true)
    await restart()
    expect(useAppStore.getState().pristineDemo).toBe(false)
  })
  it('lets two tabs on the same copy change view settings without a conflict; the last write wins', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    const copy = await get(WORKSPACE_STORAGE_KEY)
    // Another tab on the same copy wrote its view.
    await set(WORKSPACE_SETTINGS_KEY, { ...await get(WORKSPACE_SETTINGS_KEY), trajectoryView: { ...defaultTrajectoryView(), axis: 'calendar' } })
    act(() => { useAppStore.getState().setTrajectoryView({ ...defaultTrajectoryView(), chartSize: 'medium' }) })
    await settle()
    expect(useWorkspaceStorage.getState()).toMatchObject({ enabled: true, status: 'saved', message: null })
    expect((await get(WORKSPACE_SETTINGS_KEY)).trajectoryView).toMatchObject({ chartSize: 'medium', axis: 'baseline' })
    expect((await get(WORKSPACE_STORAGE_KEY)).writeToken).toBe(copy.writeToken)
  })
  it('skips the settings of a tab whose dataset is no longer the saved copy', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    // Another tab saved data: new copy, with its own settings record.
    const newer = { ...await get(WORKSPACE_STORAGE_KEY), writeToken: 'another-tab', fileName: 'newer.csv' }
    const theirs = { version: 1, datasetToken: 'another-tab', trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: { ...defaultTrajectoryView(), axis: 'age' } }
    await set(WORKSPACE_STORAGE_KEY, newer); await set(WORKSPACE_SETTINGS_KEY, theirs)
    act(() => { useAppStore.getState().setTrajectoryView({ ...defaultTrajectoryView(), chartSize: 'large' }) })
    await settle()
    expect(await get(WORKSPACE_SETTINGS_KEY)).toEqual(theirs)
    // No error for a view toggle; the data conflict rule applies on the next data change, as before.
    expect(useWorkspaceStorage.getState().status).toBe('saved')
  })
  it('never applies settings that belong to another dataset copy', async () => {
    const key = JSON.stringify(['Marker', 'u'])
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    await set(WORKSPACE_SETTINGS_KEY, { version: 1, datasetToken: 'some-other-copy', trajectoryFitSettings: { shared: defaultFitSettings('ckd_progression'), columns: {} }, trajectoryView: { ...defaultTrajectoryView(), trendKeys: [key] } })
    await restart()
    expect(useAppStore.getState().rows).toHaveLength(1)
    expect(useAppStore.getState().trajectoryFitSettings).toEqual(defaultTrajectoryFitSettings())
    expect(useAppStore.getState().trajectoryView).toEqual(defaultTrajectoryView())
    expect(useAppStore.getState().notice?.text).toMatch(/^Dataset restored from this device\. No analysis settings were saved with this copy/)
  })
  it('replacing the dataset replaces its settings in the same write', async () => {
    const key = JSON.stringify(['Marker', 'u'])
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    act(() => { useAppStore.getState().setTrajectoryView({ ...defaultTrajectoryView(), trendKeys: [key] }) })
    await settle()
    act(() => { useAppStore.getState().replaceDataset({ rows: [{ ...row, bezeichnung: 'Other' }], fileName: 'other.csv' }) })
    await waitFor(async () => expect((await get(WORKSPACE_STORAGE_KEY)).fileName).toBe('other.csv'))
    const copy = await get(WORKSPACE_STORAGE_KEY)
    expect(await get(WORKSPACE_SETTINGS_KEY)).toEqual({ version: 1, datasetToken: copy.writeToken, trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: defaultTrajectoryView() })
  })
  it('restores a copy without settings with defaults and says so', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    await del(WORKSPACE_SETTINGS_KEY)
    await restart()
    expect(useAppStore.getState().rows).toHaveLength(1)
    expect(useAppStore.getState().trajectoryFitSettings).toEqual(defaultTrajectoryFitSettings())
    expect(useAppStore.getState().notice?.text).toMatch(/^Dataset restored from this device\. No analysis settings were saved with this copy/)
  })
  it('does not claim settings were restored when all of them were discarded', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    await set(WORKSPACE_SETTINGS_KEY, { ...await get(WORKSPACE_SETTINGS_KEY), version: 99 })
    await restart()
    const text = useAppStore.getState().notice?.text ?? ''
    expect(text).toMatch(/^Dataset restored from this device\. Its saved analysis settings could not be used \(saved by another version\)/)
    expect(text).not.toMatch(/analysis settings \(presets, trend and display choices\) restored/)
    expect(restoredNotice({ stored: 'restored', notRestored: [], keptAsCustom: ['shared settings'] })).toContain('Shown as "Custom configuration" with their saved values, because the preset has changed since they were saved: shared settings.')
    expect(restoredNotice({ stored: 'restored', notRestored: [], keptAsCustom: ['shared settings'] })).toMatch(/The fits use the saved values, so results do not change; the preset name is no longer shown, and the exported fit configuration gives preset "custom"\.$/)
  })
  it('keeps the dataset and names stored settings that no longer fit', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    await setWorkspaceRemember(true)
    const settings = await get(WORKSPACE_SETTINGS_KEY)
    settings.trajectoryFitSettings.columns[JSON.stringify(['Gone', 'u'])] = defaultFitSettings('ckd_progression')
    settings.trajectoryView.chartSize = 'huge'
    await set(WORKSPACE_SETTINGS_KEY, settings)
    await restart()
    const restored = useAppStore.getState()
    expect(restored.rows).toHaveLength(1)
    expect(restored.trajectoryFitSettings.columns).toEqual({})
    expect(restored.trajectoryView.chartSize).toBe('small')
    expect(restored.notice?.text).toContain('Not restored, the defaults are used instead: own settings of Gone [u] (parameter not in this dataset); chart size.')
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
    // The settings go with the expired copy.
    expect(await get(WORKSPACE_SETTINGS_KEY)).toBeUndefined()
    expect(useWorkspaceStorage.getState().message).toMatch(/expired/)
  })
  it('restores the time of day of a measurement and rejects a copy with an unusable one', async () => {
    useAppStore.getState().replaceDataset({ rows: [{ ...row, labTime: 6 * 3_600_000 }, row] })
    await setWorkspaceRemember(true)
    const saved = await get(WORKSPACE_STORAGE_KEY)
    stop?.()
    useAppStore.getState().reset()
    stop = await startWorkspaceStorage()
    expect(useAppStore.getState().rows.map(r => r.labTime)).toEqual([6 * 3_600_000, undefined])
    stop?.()
    await set(WORKSPACE_STORAGE_KEY, { ...saved, rows: [{ ...row, labTime: '06:00' }] })
    stop = await startWorkspaceStorage()
    expect(useWorkspaceStorage.getState().message).toMatch(/could not be read .* and was removed/)
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
  it('stops showing a save and removal time once another tab replaced or removed the copy', async () => {
    useAppStore.getState().replaceDataset({ rows: [row] })
    await setWorkspaceRemember(true)
    const mine = await get(WORKSPACE_STORAGE_KEY)
    // Unchanged copy: showing or focusing the tab changes nothing and writes nothing.
    window.dispatchEvent(new Event('focus'))
    await act(async () => { await checkSavedCopy() })
    expect(useWorkspaceStorage.getState()).toMatchObject({ enabled: true, status: 'saved', message: null, savedAt: mine.savedAt })
    expect(await get(WORKSPACE_STORAGE_KEY)).toEqual(mine)
    // The same when the copy has no settings record of its own (saved by an earlier version).
    await del(WORKSPACE_SETTINGS_KEY)
    await act(async () => { await checkSavedCopy() })
    expect(useWorkspaceStorage.getState()).toMatchObject({ enabled: true, status: 'saved', message: null })
    // Another tab saved data: new copy and settings record, seven days restarted.
    const newer = { ...mine, writeToken: 'another-tab', savedAt: mine.savedAt + 3_600_000, fileName: 'newer.csv' }
    await set(WORKSPACE_STORAGE_KEY, newer)
    await set(WORKSPACE_SETTINGS_KEY, { version: 1, datasetToken: 'another-tab', trajectoryFitSettings: defaultTrajectoryFitSettings(), trajectoryView: defaultTrajectoryView() })
    const controls = render(<WorkspaceStorageControls hasData />)
    expect(screen.getByText(/^Saved on /)).toBeInTheDocument()
    // This tab writes nothing; it is only focused again.
    act(() => { window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(useWorkspaceStorage.getState().enabled).toBe(false))
    expect(screen.queryByText(/^Saved on /)).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('The saved copy was changed or removed in another tab. Reload to resume that copy, or enable saving again to save this tab instead.')
    expect(await get(WORKSPACE_STORAGE_KEY)).toEqual(newer)
    controls.unmount()
    // A removed copy is noticed the same way.
    await act(async () => { await setWorkspaceRemember(true) })
    expect(useWorkspaceStorage.getState().status).toBe('saved')
    await del(WORKSPACE_STORAGE_KEY); await del(WORKSPACE_SETTINGS_KEY)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(useWorkspaceStorage.getState().message).toMatch(/another tab/))
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    // After the listeners are removed, nothing is checked any more.
    await act(async () => { await setWorkspaceRemember(true) })
    stop?.()
    await del(WORKSPACE_STORAGE_KEY); await del(WORKSPACE_SETTINGS_KEY)
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(useWorkspaceStorage.getState()).toMatchObject({ enabled: true, status: 'saved' })
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
    expect(useWorkspaceStorage.getState()).toMatchObject({ enabled: true, status: 'saved', legacyData: 'none' })
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
    // The user learns why the earlier copy did not come back.
    expect(useWorkspaceStorage.getState().message).toMatch(/expired after seven days and was removed/)

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
    expect(useWorkspaceStorage.getState().legacyData).toBe('removed')
    expect(await keys()).toEqual(['another-app:state'])
    render(<WorkspaceApp />)
    expect(screen.getByText(/or settings saved on this device by the former version of Lab Trajectory Explorer were removed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/former version/)).not.toBeInTheDocument()
    await restart()
    expect(useWorkspaceStorage.getState().legacyData).toBe('none')
  })
  it('reports an unreadable copy in the shared database like one in the dedicated database', async () => {
    await setDb(WORKSPACE_STORAGE_KEY, { ...previousSnapshot(), rows: 'broken' })
    await restart()
    expect(useWorkspaceStorage.getState().message).toMatch(/could not be read .* and was removed/)
    expect(await getDb(WORKSPACE_STORAGE_KEY)).toBeUndefined()
  })
  it('replaces an expired or invalid dedicated copy with a usable earlier copy', async () => {
    for (const stale of [{ ...previousSnapshot(), writeToken: 'stale', savedAt: Date.now() - DATASET_TTL_MS - 1 }, { version: 1, savedAt: Date.now(), rows: 'broken' }]) {
      await set(WORKSPACE_STORAGE_KEY, stale)
      await setDb(WORKSPACE_STORAGE_KEY, previousSnapshot())
      await restart()
      expect(useAppStore.getState().fileName).toBe('earlier.csv')
      expect(useAppStore.getState().rows).toHaveLength(1)
      expect((await get(WORKSPACE_STORAGE_KEY)).writeToken).toBe('previous-release')
      expect(await getDb(WORKSPACE_STORAGE_KEY)).toBeUndefined()
      await setWorkspaceRemember(false)
    }
  })
  it('still tells the user about former-interface data when removing it fails', async () => {
    await setDb('lab-explorer:dataset', { rows: [row], savedAt: Date.now() })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const realDelete = IDBObjectStore.prototype.delete
    const failing = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      if (this.transaction.db.name === 'keyval-store') throw new DOMException('blocked', 'InvalidStateError')
      return realDelete.call(this, key)
    })
    await restart()
    failing.mockRestore()
    expect(useWorkspaceStorage.getState().legacyData).toBe('removal-failed')
    expect(warn).toHaveBeenCalled()
    render(<WorkspaceApp />)
    expect(screen.getByText(/could not be removed/)).toBeInTheDocument()
  })
})
describe('saving only what can be restored', () => {
  it('does not write a snapshot it would reject on the next start', async () => {
    useAppStore.getState().replaceDataset({ rows: [{ ...row, wertNum: Number.POSITIVE_INFINITY }] })
    await setWorkspaceRemember(true)
    expect(await get(WORKSPACE_STORAGE_KEY)).toBeUndefined()
    expect(useWorkspaceStorage.getState().status).toBe('error')
    expect(useWorkspaceStorage.getState().message).toMatch(/cannot be saved/)
    expect(useAppStore.getState().rows).toHaveLength(1)
  })
})

describe('save and expiry time of the saved copy', () => {
  it('states the save time and the time after which the next start removes the copy', () => {
    // Local time, to the minute; the copy expires once more than seven days have passed.
    const savedAt = new Date(2026, 10, 21, 14, 5, 59).getTime()
    expect(savedStatusText(savedAt)).toBe('Saved on 2026-11-21 14:05; removed when the app is next opened after 2026-11-28 14:05')
    expect(savedStatusText(new Date(2026, 0, 3, 9, 7).getTime())).toBe('Saved on 2026-01-03 09:07; removed when the app is next opened after 2026-01-10 09:07')
    expect(savedStatusText(null)).toBe('Saved on this device')
  })
  it('takes the save time of the copy into the state, keeps it through a restore and a settings change, and drops it with the copy', async () => {
    useAppStore.getState().replaceDataset({ rows: [row], fileName: 'input.csv' })
    expect(useWorkspaceStorage.getState().savedAt).toBeNull()
    await setWorkspaceRemember(true)
    const copy = await get(WORKSPACE_STORAGE_KEY)
    expect(useWorkspaceStorage.getState().savedAt).toBe(copy.savedAt)
    // A copy saved three days ago is restored with its own time, not the time of the restore.
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000
    stop?.(); useAppStore.getState().reset()
    await set(WORKSPACE_STORAGE_KEY, { ...copy, savedAt: threeDaysAgo })
    stop = await startWorkspaceStorage()
    expect(useWorkspaceStorage.getState()).toMatchObject({ enabled: true, status: 'saved', savedAt: threeDaysAgo })
    act(() => { useAppStore.getState().setTrajectoryView({ ...defaultTrajectoryView(), chartSize: 'large' }) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(useWorkspaceStorage.getState().savedAt).toBe(threeDaysAgo)
    render(<WorkspaceStorageControls hasData />)
    expect(screen.getByText(savedStatusText(threeDaysAgo))).toBeInTheDocument()
    // A data change writes a new copy and starts the seven days again.
    act(() => { useAppStore.setState({ rows: [{ ...row, wertNum: 61 }] }) })
    await waitFor(async () => expect((await get(WORKSPACE_STORAGE_KEY)).savedAt).toBeGreaterThan(threeDaysAgo))
    await waitFor(async () => expect(useWorkspaceStorage.getState().savedAt).toBe((await get(WORKSPACE_STORAGE_KEY)).savedAt))
    await act(async () => { await setWorkspaceRemember(false) })
    expect(useWorkspaceStorage.getState().savedAt).toBeNull()
    expect(screen.getByText('This session only')).toBeInTheDocument()
  })
  it('says in one line when the copy is removed and keeps the list of what is saved in a disclosure', () => {
    const { container } = render(<WorkspaceStorageControls hasData />)
    const line = container.querySelector('.workspace-storage > p.muted')!
    expect(line).toHaveTextContent('Optional. Keeps an unencrypted copy of the dataset in this browser. The copy is removed when the app is next opened more than seven days after the last data change; until then it stays on this device.')
    const details = screen.getByText('What is saved').closest('details')!
    expect(details).not.toHaveAttribute('open')
    expect(details).toHaveTextContent(/Saved: lab values, events, attributes, demographic edits, derivation settings/)
    expect(details).toHaveTextContent(/Not saved: sorting, grouping and patient selection, and cohort model settings and results\./)
    expect(details).toHaveTextContent(/changing analysis settings does not extend them/)
    expect(details).toHaveTextContent(/the browser asks before the page is reloaded or closed/)
  })
})
