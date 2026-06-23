import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toolbar } from '../../src/ui/shell/Toolbar'
import { useAppStore } from '../../src/ui/state/store'
import { hasSavedDataset, clearDataset } from '../../src/io/persistence'
import type { LabRow } from '../../src/core/types'

function row(p: Partial<LabRow>): LabRow {
  return { patientId: 1, labDatum: new Date('2020-01-01'), bezeichnung: 'Kreatinin', einheit: 'mg/dl',
    wert: '1', wertNum: 1, wertOperator: '=', loinc: null, patientSex: null, patientAgeAtLab: null,
    ...p }
}

describe('persistence UI', () => {
  beforeEach(async () => { await clearDataset(); useAppStore.getState().reset() })

  it('persists the dataset only after the user enables "Remember on this device"', async () => {
    useAppStore.getState().setDataset([row({ patientId: 3 })], 'a.xlsx')
    expect(await hasSavedDataset()).toBe(false)
    render(<Toolbar />)
    await userEvent.click(screen.getByLabelText(/remember on this device/i))
    expect(await hasSavedDataset()).toBe(true)
  })

  it('shows a Clear saved data control that wipes persistence', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true) // confirm the destructive action
    useAppStore.getState().setPersist(true)
    useAppStore.getState().setDataset([row({ patientId: 3 })], 'a.xlsx')
    expect(await hasSavedDataset()).toBe(true)
    render(<Toolbar />)
    await userEvent.click(screen.getByRole('button', { name: /clear saved data/i }))
    expect(await hasSavedDataset()).toBe(false)
    expect(useAppStore.getState().persist).toBe(false)
  })
})
