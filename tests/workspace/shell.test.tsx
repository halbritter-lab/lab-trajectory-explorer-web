import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { WorkspaceApp } from '../../src/workspace/WorkspaceApp'

const fixture = vi.hoisted(() => ({ rows: [{ patientId: 'alpha' }] }))
vi.mock('../../src/workspace/workspace-data', () => ({
  useWorkspaceData: () => ({ rawRows: fixture.rows, rows: fixture.rows, patients: fixture.rows, parameters: [], fileName: 'research.csv' }),
}))
vi.mock('../../src/workspace/DataWorkspace', () => ({
  DataWorkspace: ({ onBrowse }: { onBrowse: (id?: string) => void }) => <button onClick={() => onBrowse('alpha')}>Person prüfen</button>,
}))
vi.mock('../../src/workspace/TrajectoriesWorkspace', () => ({
  TrajectoriesWorkspace: ({ requestedPatientId }: { requestedPatientId?: string }) => {
    const [query, setQuery] = useState('')
    return <><label>Browsersuche<input value={query} onChange={e => setQuery(e.target.value)} /></label><span>Person: {requestedPatientId}</span></>
  },
}))
vi.mock('../../src/ui/pages/Methodology', () => ({ Methodology: () => <p>Methodik-Inhalt</p> }))

describe('workspace shell', () => {
  beforeEach(() => { fixture.rows = [{ patientId: 'alpha' }] })
  it('retains browser state through data navigation and opens the requested person', () => {
    render(<WorkspaceApp />)
    fireEvent.click(screen.getByRole('button', { name: /^Verläufe$/ }))
    fireEvent.change(screen.getByLabelText('Browsersuche'), { target: { value: 'alpha' } })
    fireEvent.click(screen.getByRole('button', { name: /^Daten$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Person prüfen' }))
    expect(screen.getByLabelText('Browsersuche')).toHaveValue('alpha')
    expect(screen.getByText('Person: alpha')).toBeVisible()
  })
  it('resets patient browser state when the loaded dataset is replaced', () => {
    const result = render(<WorkspaceApp />)
    fireEvent.click(screen.getByRole('button', { name: /^Verläufe$/ }))
    fireEvent.change(screen.getByLabelText('Browsersuche'), { target: { value: 'old scope' } })
    fixture.rows = [{ patientId: 'beta' }]
    result.rerender(<WorkspaceApp />)
    expect(screen.getByLabelText('Browsersuche')).toHaveValue('')
  })
  it('does not offer a synthetic fit for loaded research data', () => {
    render(<WorkspaceApp />)
    fireEvent.click(screen.getByRole('button', { name: /^Kohortenmodelle$/ }))
    expect(screen.queryByRole('button', { name: /berechnen/i })).not.toBeInTheDocument()
    expect(screen.getByText(/noch nicht angebunden/)).toBeVisible()
  })
})
