import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { DataWorkspace } from '../../src/workspace/DataWorkspace'
import { WorkspaceStorageControls } from '../../src/workspace/WorkspaceStorageControls'
import { composedNotice, useAppStore } from '../../src/workspace/state/store'
import { importWorkspaceFile } from '../../src/workspace/workspace-data'
import { useWorkspaceStorage } from '../../src/workspace/workspace-storage'
import { setLanguage, t, msg } from '../../src/i18n'

// Code review of the language switch (issue #71): texts kept in state are
// composed where they are shown, so they follow a later switch.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
const csv = (lines: string[]) => ({ name: 'labs.csv', arrayBuffer: async () => new TextEncoder().encode(['patientId,labDate,testName,unit,value', ...lines].join('\n')).buffer }) as File

it('shows the import notice in the language of the moment, not of the import', async () => {
  useAppStore.getState().reset()
  await importWorkspaceFile(csv(['A,2026-09-01,Kreatinin,mg/dl,1.0', 'A,2026-10-01,Kreatinin,mg/dl,1.1']))
  render(<DataWorkspace onBrowse={vi.fn()} />)
  expect(screen.getByText(/^2 lab values, 0 events and 0 attribute rows loaded\./)).toBeInTheDocument()
  act(() => setLanguage('de'))
  expect(screen.getByText(/^2 Laborwerte, 0 Ereignisse und 0 Attributzeilen geladen\./)).toBeInTheDocument()
  expect(screen.queryByText(/lab values, 0 events/)).not.toBeInTheDocument()
})

it('composes a notice again on every call', () => {
  const notice = composedNotice('info', () => t('Dismiss'))
  expect(notice.text).toBe('Dismiss')
  setLanguage('de')
  expect(notice.compose?.()).not.toBe('Dismiss')
})

it('translates the import findings source labels and the storage message at render', () => {
  useAppStore.getState().reset()
  useAppStore.getState().setImportDiagnostics('labs', [{ source: 'labs', sheet: 'labs', patientId: 'P-1', severity: 'warning', reason: 'Finding' }])
  useWorkspaceStorage.setState({ status: 'session', message: msg('The saved workspace expired after seven days and was removed. Import your file to continue.') })
  render(<><DataWorkspace onBrowse={vi.fn()} /><WorkspaceStorageControls hasData={false} /></>)
  const panel = screen.getByRole('group', { name: 'Import diagnostics' })
  expect(within(panel).getByText('Lab values')).toBeInTheDocument()
  act(() => setLanguage('de'))
  expect(within(screen.getByRole('group', { name: 'Importbefunde' })).getByText('Laborwerte')).toBeInTheDocument()
  expect(screen.getAllByText(/^Der gespeicherte Arbeitsbereich ist nach sieben Tagen abgelaufen/).length).toBeGreaterThan(0)
  useWorkspaceStorage.setState({ message: null })
})
