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
vi.mock('../../src/ui/pages/Methodology', () => ({ Methodology: () => <p>Methods content</p> }))

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
  it('distinguishes workspace methods from the optional full application reference', () => {
    render(<WorkspaceApp />)
    fireEvent.click(screen.getByRole('button', { name: /^Methods$/ }))
    expect(screen.getByRole('heading', { name: 'Available in this workspace' })).toBeVisible()
    expect(screen.getByText('Methods content')).not.toBeVisible()
    fireEvent.click(screen.getByText('Full application reference — includes features not available here'))
    // jsdom does not toggle native details on click; the full reference must be
    // nested within that explicitly named disclosure, not the primary guide.
    expect(screen.getByText('Methods content').closest('details')).not.toBeNull()
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
  })
})

