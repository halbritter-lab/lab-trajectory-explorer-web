import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import * as exports from '../../src/io/export'
import { WorkspaceExportActions, ChartExportActions } from '../../src/workspace/WorkspaceExports'
import { exportFixture } from './export-fixture'

vi.mock('../../src/io/export',async importOriginal => ({...await importOriginal<typeof exports>(),downloadBlob:vi.fn(),svgStringToPngBlob:vi.fn()}))
beforeEach(() => {vi.clearAllMocks()})

it('downloads real scoped workbook bytes and explains empty selections', () => {
  const input = exportFixture()
  const {rerender} = render(<WorkspaceExportActions {...input} patientId="001-A" />)
  fireEvent.click(screen.getByRole('button',{name:'Patient exportieren (XLSX)'}))
  const [bytes,filename,mime] = vi.mocked(exports.downloadBlob).mock.calls[0]
  expect(filename).toMatch(/001-A.*\.xlsx$/)
  expect(mime).toContain('spreadsheetml')
  const workbook = XLSX.read(bytes,{type:'array'})
  const measurements = XLSX.utils.sheet_to_json(workbook.Sheets.measurements)
  expect(measurements).toHaveLength(2)
  expect(measurements).toEqual(expect.arrayContaining([expect.objectContaining({PatientID:'001-A',WertNum:70})]))
  rerender(<WorkspaceExportActions {...input} parameterKeys={[]} />)
  expect(screen.getByRole('button',{name:'Kohorte exportieren (XLSX)'})).toBeDisabled()
  expect(screen.getByText(/Patienten und Parameter auswählen/)).toBeInTheDocument()
})

it('reports unavailable charts and conversion failures, then permits retry', async () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
  svg.setAttribute('viewBox','0 0 400 200')
  svg.append(document.createElementNS(svg.namespaceURI,'circle'))
  const {rerender} = render(<ChartExportActions getSvg={() => null} title="Marker" />)
  fireEvent.click(screen.getByRole('button',{name:'SVG herunterladen'}))
  expect(screen.getByRole('alert')).toHaveTextContent('Kein Diagramm verfügbar')
  expect(exports.downloadBlob).not.toHaveBeenCalled()
  rerender(<ChartExportActions getSvg={() => svg} title="Marker" />)
  vi.mocked(exports.svgStringToPngBlob).mockRejectedValueOnce(new Error('Canvas nicht verfügbar'))
  fireEvent.click(screen.getByRole('button',{name:'PNG herunterladen'}))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Canvas nicht verfügbar'))
  fireEvent.click(screen.getByRole('button',{name:'SVG herunterladen'}))
  expect(vi.mocked(exports.downloadBlob).mock.calls[0][0]).toContain('Nur für Forschungszwecke')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('downloads nonempty PNG bytes from the same attributed SVG', async () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg')
  svg.setAttribute('viewBox','0 0 400 200')
  svg.append(document.createElementNS(svg.namespaceURI,'circle'))
  const pngBytes = new Uint8Array([137,80,78,71,13,10,26,10])
  vi.mocked(exports.svgStringToPngBlob).mockResolvedValueOnce(new Blob([pngBytes],{type:'image/png'}))
  render(<ChartExportActions getSvg={() => svg} title="Marker" />)
  fireEvent.click(screen.getByRole('button',{name:'PNG herunterladen'}))
  await waitFor(() => expect(exports.downloadBlob).toHaveBeenCalled())
  expect(vi.mocked(exports.svgStringToPngBlob).mock.calls[0][0]).toContain('Nur für Forschungszwecke')
  const [bytes,filename,mime] = vi.mocked(exports.downloadBlob).mock.calls[0]
  expect(bytes).toEqual(pngBytes)
  expect(filename).toMatch(/\.png$/)
  expect(mime).toBe('image/png')
})

