import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import * as exports from '../../src/io/export'
import { WorkspaceExportActions, ChartExportActions } from '../../src/workspace/WorkspaceExports'
import { exportFixture } from './export-fixture'
import { unzipSync, strFromU8 } from 'fflate'

vi.mock('../../src/io/export',async importOriginal => ({...await importOriginal<typeof exports>(),downloadBlob:vi.fn(),svgStringToPngBlob:vi.fn()}))
beforeEach(() => {vi.clearAllMocks()})

it('bundles the patient workbook with distinct attributed SVG files', async () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 400 200')
  svg.append(document.createElementNS(svg.namespaceURI, 'circle'))
  render(<WorkspaceExportActions {...exportFixture()} patientId="001-A" getCharts={() => [{ title: 'Marker/u', svg }, { title: 'Marker:u', svg }]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Export patient bundle (ZIP)' }))
  await waitFor(() => expect(exports.downloadBlob).toHaveBeenCalled())
  const [bytes, filename, mime] = vi.mocked(exports.downloadBlob).mock.calls[0]
  expect(filename).toMatch(/\.zip$/)
  expect(mime).toBe('application/zip')
  const files = unzipSync(bytes as Uint8Array)
  const charts = Object.keys(files).filter(name => name.endsWith('.svg'))
  expect(charts).toHaveLength(2)
  for (const name of charts) expect(strFromU8(files[name])).toContain('Research use only')
  const book = XLSX.read(files[Object.keys(files).find(name => name.endsWith('.xlsx'))!], { type: 'array' })
  expect(XLSX.utils.sheet_to_json(book.Sheets.measurements)).toHaveLength(2)
})

it('downloads real scoped workbook bytes and explains empty selections', async () => {
  const input = exportFixture()
  const {rerender} = render(<WorkspaceExportActions {...input} patientId="001-A" />)
  fireEvent.click(screen.getByRole('button',{name:'Export patient (XLSX)'}))
  await waitFor(() => expect(exports.downloadBlob).toHaveBeenCalled())
  const [bytes,filename,mime] = vi.mocked(exports.downloadBlob).mock.calls[0]
  expect(filename).toMatch(/001-A.*\.xlsx$/)
  expect(mime).toContain('spreadsheetml')
  const workbook = XLSX.read(bytes,{type:'array'})
  const measurements = XLSX.utils.sheet_to_json(workbook.Sheets.measurements)
  expect(measurements).toHaveLength(2)
  expect(measurements).toEqual(expect.arrayContaining([expect.objectContaining({PatientID:'001-A',NumericValue:70})]))
  rerender(<WorkspaceExportActions {...input} parameterKeys={[]} />)
  expect(screen.getByRole('button',{name:'Export cohort (XLSX)'})).toBeDisabled()
  expect(screen.getByText(/Select patients and parameters/)).toBeInTheDocument()
})

it('reports unavailable charts and conversion failures, then permits retry', async () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
  svg.setAttribute('viewBox','0 0 400 200')
  svg.append(document.createElementNS(svg.namespaceURI,'circle'))
  const {rerender} = render(<ChartExportActions getSvg={() => null} title="Marker" />)
  fireEvent.click(screen.getByRole('button',{name:'Download SVG'}))
  expect(screen.getByRole('alert')).toHaveTextContent('No chart available')
  expect(exports.downloadBlob).not.toHaveBeenCalled()
  rerender(<ChartExportActions getSvg={() => svg} title="Marker" />)
  vi.mocked(exports.svgStringToPngBlob).mockRejectedValueOnce(new Error('Canvas unavailable'))
  fireEvent.click(screen.getByRole('button',{name:'Download PNG'}))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Canvas unavailable'))
  fireEvent.click(screen.getByRole('button',{name:'Download SVG'}))
  expect(vi.mocked(exports.downloadBlob).mock.calls[0][0]).toContain('Research use only')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('downloads nonempty PNG bytes from the same attributed SVG', async () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
  svg.setAttribute('viewBox','0 0 400 200')
  svg.append(document.createElementNS(svg.namespaceURI,'circle'))
  const pngBytes = new Uint8Array([137,80,78,71,13,10,26,10])
  vi.mocked(exports.svgStringToPngBlob).mockResolvedValueOnce(new Blob([pngBytes],{type:'image/png'}))
  render(<ChartExportActions getSvg={() => svg} title="Marker" />)
  fireEvent.click(screen.getByRole('button',{name:'Download PNG'}))
  await waitFor(() => expect(exports.downloadBlob).toHaveBeenCalled())
  expect(vi.mocked(exports.svgStringToPngBlob).mock.calls[0][0]).toContain('Research use only')
  const [bytes,filename,mime] = vi.mocked(exports.downloadBlob).mock.calls[0]
  expect(bytes).toEqual(pngBytes)
  expect(filename).toMatch(/\.png$/)
  expect(mime).toBe('image/png')
})


it('names a restricted cohort scope on the button and shows a status while the workbook is written', async () => {
  const input = exportFixture()
  const {rerender} = render(<WorkspaceExportActions {...input} patientIds={input.data.patients.map(patient => patient.id)} />)
  expect(screen.getByRole('button',{name:'Export cohort (XLSX)'})).toBeEnabled()
  rerender(<WorkspaceExportActions {...input} patientIds={['001-A']} />)
  const button = screen.getByRole('button',{name:'Export 1 of 2 patients (XLSX)'})
  fireEvent.click(button)
  // The status is on the page before the blocking write starts.
  expect(screen.getByRole('status')).toHaveTextContent('Exporting …')
  expect(button).toBeDisabled()
  expect(exports.downloadBlob).not.toHaveBeenCalled()
  await waitFor(() => expect(exports.downloadBlob).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  expect(button).toBeEnabled()
  const workbook = XLSX.read(vi.mocked(exports.downloadBlob).mock.calls[0][0],{type:'array'})
  expect(new Set(XLSX.utils.sheet_to_json<{PatientID:string}>(workbook.Sheets.measurements).map(row => row.PatientID))).toEqual(new Set(['001-A']))
})

it('reports a failed workbook export and ends the status', async () => {
  const input = exportFixture()
  render(<WorkspaceExportActions {...input} />)
  vi.mocked(exports.downloadBlob).mockImplementationOnce(() => { throw new Error('Disk full') })
  fireEvent.click(screen.getByRole('button',{name:/^Export .*\(XLSX\)$/}))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Export failed: Disk full'))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
