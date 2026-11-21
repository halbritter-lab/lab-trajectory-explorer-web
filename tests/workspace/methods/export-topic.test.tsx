import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { Methodology } from '../../../src/workspace/methods/Methodology'
import { workspaceWorkbookSheets } from '../../../src/workspace/workspace-export'
import { mixedModelExportSheets } from '../../../src/core/mixedModel/modelExport'
import { exportFixture } from '../export-fixture'

function topic(id: string) {
  act(() => {
    window.history.replaceState(null, '', `/#methods/${id}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}
/** Sheet names named in the first column of a reference table ("a / b" lists several). */
const listed = (label: string) => within(screen.getByRole('region', { name: label })).getAllByRole('row').slice(1)
  .flatMap(row => (row.querySelector('td')?.textContent ?? '').split('/').map(name => name.trim()))

describe('Methods: Export & reproducibility', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'))

  it('lists every sheet of the cohort workbook, the columns sheet included', () => {
    topic('export')
    render(<Methodology />)
    const names = listed('Workbook contents')
    for (const sheet of [...workspaceWorkbookSheets(exportFixture()), ...workspaceWorkbookSheets({ ...exportFixture(), patientId: '001-A' })]) expect(names, sheet.name).toContain(sheet.name)
    expect(names).toContain('columns')
  })

  it('lists every sheet of the cohort-model workbook and explains unit_key, export_id and the R refit', () => {
    topic('export')
    render(<Methodology />)
    const names = listed('Cohort-model workbook contents')
    // `projections` is written only with an applied projection; the page lists it too.
    for (const sheet of mixedModelExportSheets([])) expect(names, sheet.name).toContain(sheet.name)
    expect(names).toContain('projections')
    expect(screen.getByRole('heading', { name: 'Cohort-model workbook' })).toHaveAttribute('id', 'methods-model-workbook')
    expect(screen.getByRole('navigation', { name: 'On this page' })).toHaveTextContent('Cohort-model workbook')
    expect(screen.getByText(/identifies the fitted unit on every sheet/)).toHaveTextContent('unit_key identifies the fitted unit on every sheet: cohort for the whole cohort, group:<value> for a group.')
    expect(screen.getByText(/ties a workbook to its/)).toHaveTextContent('export_id in the about sheet ties a workbook to its r_script.')
    const steps = within(screen.getByText('To refit a model in R:').nextElementSibling as HTMLElement).getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toHaveTextContent('r_script')
    expect(steps[0]).toHaveTextContent('mm_workbook')
    expect(steps[1]).toHaveTextContent('readxl')
    expect(steps[2]).toHaveTextContent('mm_fits')
  })
})
