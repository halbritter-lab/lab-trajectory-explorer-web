import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DataWorkspace } from '../../src/workspace/DataWorkspace'
import { useAppStore } from '../../src/ui/state/store'
import type { LabRow } from '../../src/core/types'

beforeEach(() => {
  useAppStore.getState().reset()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(cleanup)
const row: LabRow = { patientId: 'P-01', labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl', wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null }
it('blocks derivation when its output collides with an imported computed series', () => {
  useAppStore.getState().setDataset([
    { ...row, patientSex: 'm', patientAgeAtLab: 50 },
    { ...row, bezeichnung: 'eGFR (EKFC 2021, computed)', einheit: 'ml/min/1,73m²', wert: '90', wertNum: 90 },
  ])
  render(<DataWorkspace onBrowse={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('eGFR-Formel'), { target: { value: 'ekfc-2021' } })
  expect(screen.getByRole('alert')).toHaveTextContent('bereits als importierter Parameter vorhanden')
  expect(screen.getByRole('button', { name: 'Berechnung anwenden' })).toBeDisabled()
  expect(useAppStore.getState().displayRows()).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('eGFR-Formel'), { target: { value: 'ckd-epi-2021' } })
  expect(screen.getByRole('button', { name: 'Berechnung anwenden' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Berechnung anwenden' }))
  expect(useAppStore.getState().displayRows()).toHaveLength(3)
})
it('shows missing demographics and corrects them at the explicit baseline date', () => {
  useAppStore.getState().setDataset([row], 'actual.csv')
  render(<DataWorkspace onBrowse={vi.fn()} />)
  fireEvent.click(screen.getByText('Personen prüfen und bearbeiten (1)'))
  fireEvent.click(screen.getByRole('button', { name: 'Demografie bearbeiten: P-01' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/2020-01-01/)).toBeInTheDocument()
  fireEvent.change(within(dialog).getByLabelText('Geschlecht'), { target: { value: 'w' } })
  fireEvent.change(within(dialog).getByLabelText('Alter am Referenzdatum'), { target: { value: '60' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
  expect(useAppStore.getState().manualDemographics['P-01']).toEqual({ sex: 'w', age: 60 })
  expect(useAppStore.getState().rows[0].patientSex).toBeNull()
})
it('imports separate attributes and events and keeps existing attributes on an invalid upload', async () => {
  useAppStore.getState().setDataset([row])
  render(<DataWorkspace onBrowse={vi.fn()} />)
  const file = (text: string) => ({ name: 'extra.csv', arrayBuffer: async () => new TextEncoder().encode(text).buffer })
  fireEvent.change(screen.getByLabelText('Attribute ersetzen'), { target: { files: [file('patientId,cohort,sex\nP-01,Group X,w\n')] } })
  await waitFor(() => expect(useAppStore.getState().patientAttributes['P-01']).toMatchObject({ cohort: 'Group X', sex: 'w' }))
  const kept = useAppStore.getState().patientAttributes
  fireEvent.change(screen.getByLabelText('Attribute ersetzen'), { target: { files: [file('invalid\nno\n')] } })
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(useAppStore.getState().patientAttributes).toBe(kept)
  fireEvent.change(screen.getByLabelText('Ereignisse ersetzen'), { target: { files: [file('patientId,type,date,title\nP-01,other,2020-03-01,Visit\n')] } })
  await waitFor(() => expect(useAppStore.getState().events).toHaveLength(1))
  expect(useAppStore.getState().events[0]).toMatchObject({ patientId: 'P-01', title: 'Visit' })
})
it('previews EKFC without applying it, then applies and turns derivation off', () => {
  useAppStore.getState().setDataset([{ ...row, patientSex: 'm', patientAgeAtLab: 50 }])
  render(<DataWorkspace onBrowse={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('eGFR-Formel'), { target: { value: 'ekfc-2021' } })
  expect(screen.getByText('1 berechnete Werte in der Vorschau')).toBeInTheDocument()
  expect(useAppStore.getState().displayRows()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Berechnung anwenden' }))
  expect(useAppStore.getState().displayRows()).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('eGFR-Formel'), { target: { value: 'off' } })
  fireEvent.click(screen.getByRole('button', { name: 'Berechnung anwenden' }))
  expect(useAppStore.getState().displayRows()).toHaveLength(1)
})
