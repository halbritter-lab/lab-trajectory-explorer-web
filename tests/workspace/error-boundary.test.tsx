import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '../../src/workspace/ErrorBoundary'
import { WorkspaceApp } from '../../src/workspace/WorkspaceApp'

const fixture = vi.hoisted(() => ({ modelsThrow: false }))
vi.mock('../../src/workspace/workspace-data', () => ({
  useWorkspaceData: () => ({ rawRows: [{ patientId: 'alpha' }], rows: [{ patientId: 'alpha' }], patients: [{ id: 'alpha' }], parameters: [], fileName: 'research.csv' }),
}))
vi.mock('../../src/workspace/DataWorkspace', () => ({ DataWorkspace: () => <p>Data page</p> }))
vi.mock('../../src/workspace/TrajectoriesWorkspace', () => ({ TrajectoriesWorkspace: () => <p>Trajectories page</p> }))
vi.mock('../../src/workspace/CohortModelsWorkspace', () => ({
  CohortModelsWorkspace: () => {
    if (fixture.modelsThrow) throw new Error('Failed to fetch dynamically imported module')
    return <p>Models page</p>
  },
}))

describe('error boundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>
  // React logs every caught rendering error; the boundary logs it once more.
  // jsdom would also print each of them as an uncaught error.
  const handled = (event: ErrorEvent) => event.preventDefault()
  beforeEach(() => { consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}); window.addEventListener('error', handled); fixture.modelsThrow = false })
  afterEach(() => { consoleError.mockRestore(); window.removeEventListener('error', handled) })

  it('replaces only its own area and renders it again on Retry', () => {
    let fail = true
    const Area = () => { if (fail) throw new Error('boom'); return <p>Area content</p> }
    render(<><p>Outside</p><ErrorBoundary area="This area" hint="Nothing else is affected."><Area /></ErrorBoundary></>)
    expect(screen.getByText('Outside')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('This area could not be displayed')
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing else is affected.')
    expect(screen.getByRole('alert')).toHaveTextContent('Error: boom')
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText('Area content')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the fallback again when the area still fails after Retry', () => {
    const Area = (): never => { throw new Error('still broken') }
    render(<ErrorBoundary area="This area" hint="Hint."><Area /></ErrorBoundary>)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Error: still broken')
  })

  it('keeps header, navigation and the other pages when the hidden Cohort models page fails', () => {
    fixture.modelsThrow = true
    // The models page is rendered while the Data page is shown.
    render(<WorkspaceApp />)
    expect(screen.getByText('Lab Trajectory Explorer')).toBeInTheDocument()
    expect(screen.getByText('Data page')).toBeVisible()
    expect(screen.getByText('research.csv')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cohort models' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The Cohort models page could not be displayed')
    expect(screen.getByRole('alert')).toHaveTextContent('The loaded data and the other pages are not affected.')
    fixture.modelsThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText('Models page')).toBeVisible()
  })
})
