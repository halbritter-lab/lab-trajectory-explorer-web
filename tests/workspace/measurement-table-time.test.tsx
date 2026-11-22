import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LabRow } from '../../src/core/types'
import { buildCohortRows } from '../../src/core/cohort/screening'
import { measurementFitStatus } from '../../src/workspace/measurement-fit-status'
import { measurementDisplayOrder, PatientMeasurementTable } from '../../src/workspace/PatientMeasurementTable'
import { loadDatasetFromWorkbook } from '../../src/io/loadDataset'

const parameter = { key: JSON.stringify(['Kreatinin', 'mg/dl']), label: 'Kreatinin [mg/dl]', bezeichnung: 'Kreatinin', einheit: 'mg/dl', derived: false }

// K26 follow-up (2026-11-22): the measurement table shows the time of day and orders the rows
// of one day by it; the fit status, which follows the fitted points, moves with its row.
describe('patient measurement table: time of day', () => {
  const csv = ['patientId,labDate,testName,unit,value', 'P1,2026-09-01 20:00,Kreatinin,mg/dl,<0.5', 'P1,2026-09-01 06:00,Kreatinin,mg/dl,1.0', 'P1,2026-09-03,Kreatinin,mg/dl,1.2', 'P1,2026-09-03,Kreatinin,mg/dl,1.1', 'P1,2026-09-05 08:30:15,Kreatinin,mg/dl,0.9'].join('\n')
  const rows = loadDatasetFromWorkbook(new TextEncoder().encode(csv)).rows

  it('orders a day by time only when every row of that day has one', () => {
    expect(measurementDisplayOrder(rows)).toEqual([1, 0, 2, 3, 4])
    const mixed: LabRow[] = [{ ...rows[0] }, { ...rows[1], labTime: undefined }]
    expect(measurementDisplayOrder(mixed)).toEqual([0, 1])
  })

  it('shows the time beside the date and keeps the fit status with its row', () => {
    const cell = buildCohortRows(rows, ['P1'], [{ bezeichnung: 'Kreatinin', einheit: 'mg/dl', mode: 'global' }])[0].cells[0]
    const status = measurementFitStatus(rows, cell)
    expect(status[0]).toMatch(/^Excluded: censored value/)
    render(<PatientMeasurementTable parameter={parameter} measurements={rows} fitStatus={status} events={[]} />)
    const body = screen.getByRole('table', { name: 'Measurements Kreatinin [mg/dl]' }).querySelectorAll('tbody tr')
    const cells = [...body].map(row => within(row as HTMLElement).getAllByRole('cell').map(td => td.textContent))
    expect(cells.map(row => [row[0], row[1], row[4]])).toEqual([
      ['01/09/2026 06:00', '1.0', status[1]],
      ['01/09/2026 20:00', '<0.5', status[0]],
      ['03/09/2026', '1.2', status[2]],
      ['03/09/2026', '1.1', status[3]],
      ['05/09/2026 08:30:15', '0.9', status[4]],
    ])
    expect(cells[1][4]).toMatch(/^Excluded: censored value/)
  })
})
