import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { WorkspaceApp } from '../../src/workspace/WorkspaceApp'

const fixture = vi.hoisted(() => ({ rows: [{ patientId: 'alpha' }], browseId: 'alpha' as string | number }))
vi.mock('../../src/workspace/workspace-data', () => ({
  useWorkspaceData: () => ({ rawRows: fixture.rows, rows: fixture.rows, patients: fixture.rows, parameters: [], fileName: 'research.csv' }),
}))
vi.mock('../../src/workspace/DataWorkspace', () => ({
  DataWorkspace: ({ onBrowse }: { onBrowse: (id?: string) => void }) => <button onClick={() => onBrowse(fixture.browseId as string)}>Review patient</button>,
}))
vi.mock('../../src/workspace/TrajectoriesWorkspace', () => ({
  TrajectoriesWorkspace: ({ requestedPatientId }: { requestedPatientId?: string }) => {
    const [query, setQuery] = useState('')
    return <><label>Patient search<input value={query} onChange={e => setQuery(e.target.value)} /></label><span>Patient: {requestedPatientId}</span></>
  },
}))
vi.mock('../../src/workspace/methods/Methodology', () => ({ Methodology: () => <p>Methods content</p> }))

describe('workspace shell', () => {
  beforeEach(() => { fixture.rows = [{ patientId: 'alpha' }]; fixture.browseId = 'alpha' })
  it('records numeric patient ID 0 as a detail view in browser history', () => {
    fixture.browseId = 0
    const pushState = vi.spyOn(window.history, 'pushState')
    render(<WorkspaceApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Review patient' }))
    expect(pushState).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'detail', patientId: 0 }), '')
    pushState.mockRestore()
  })
  it('retains browser state through data navigation and opens the requested person', () => {
    render(<WorkspaceApp />)
    fireEvent.click(screen.getByRole('button', { name: /^Trajectories$/ }))
    fireEvent.change(screen.getByLabelText('Patient search'), { target: { value: 'alpha' } })
    fireEvent.click(screen.getByRole('button', { name: /^Data$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review patient' }))
    expect(screen.getByLabelText('Patient search')).toHaveValue('alpha')
    expect(screen.getByText('Patient: alpha')).toBeVisible()
  })
  it('resets patient browser state when the loaded dataset is replaced', () => {
    const result = render(<WorkspaceApp />)
    fireEvent.click(screen.getByRole('button', { name: /^Trajectories$/ }))
    fireEvent.change(screen.getByLabelText('Patient search'), { target: { value: 'old scope' } })
    fixture.rows = [{ patientId: 'beta' }]
    result.rerender(<WorkspaceApp />)
    expect(screen.getByLabelText('Patient search')).toHaveValue('')
  })
  it('shows the workspace guide followed by the full methodology reference', () => {
    render(<WorkspaceApp />)
    fireEvent.click(screen.getByRole('button', { name: /^Methods$/ }))
    expect(screen.getByRole('heading', { name: 'Available in this workspace' })).toBeVisible()
    expect(screen.getByText('Methods content')).toBeVisible()
    expect(screen.getByText('Methods content').closest('details')).toBeNull()
    expect(screen.queryByText(/Full application reference/)).not.toBeInTheDocument()
  })
  it('presents a single interface without a preview label', () => {
    render(<WorkspaceApp />)
    expect(screen.getByText('Lab Trajectory Explorer')).toBeVisible()
    expect(screen.queryByText(/Preview/)).not.toBeInTheDocument()
  })
  it('does not offer a synthetic fit for loaded research data', () => {
    render(<WorkspaceApp />)
    fireEvent.click(screen.getByRole('button', { name: /^Cohort models$/ }))
    expect(screen.queryByRole('button', { name: /calculate/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Cohort models' })).toBeVisible()
  })
  it('navigates between pages on browser popstate', () => {
    render(<WorkspaceApp />)
    fireEvent.click(screen.getByRole('button', { name: /^Trajectories$/ }))
    expect(screen.getByLabelText('Trajectory workspace')).not.toHaveAttribute('hidden')

    // Popstate back to Data
    fireEvent(window, new PopStateEvent('popstate', { state: { page: 'Data' } }))
    expect(screen.getByLabelText('Data workspace')).not.toHaveAttribute('hidden')
    expect(screen.getByLabelText('Trajectory workspace')).toHaveAttribute('hidden')

    // Popstate forward to Methods
    fireEvent(window, new PopStateEvent('popstate', { state: { page: 'Methods' } }))
    expect(screen.getByRole('heading', { name: 'Available in this workspace' })).toBeVisible()

    // An in-page anchor entry carries no app state and keeps the current page.
    fireEvent(window, new PopStateEvent('popstate', { state: null }))
    expect(screen.getByRole('heading', { name: 'Available in this workspace' })).toBeVisible()
  })
})

