import { useState } from 'react'
import { downloadBlob, svgStringToPngBlob } from '../io/export'
import { exportChartSvg, safeExportFilename, workspaceWorkbookBytes, type WorkspaceExportInput } from './workspace-export'
import './exports-workspace.css'

export function WorkspaceExportActions(props: WorkspaceExportInput) {
  const [error,setError] = useState<string | null>(null)
  const empty = props.parameterKeys.length === 0 || props.patientIds.length === 0 || (props.patientId !== undefined && !props.patientIds.includes(props.patientId))
  function download() {
    setError(null)
    try {
      const bytes = workspaceWorkbookBytes(props)
      const title = props.patientId === undefined ? 'cohort' : `Patient-${props.patientId}`
      downloadBlob(bytes,safeExportFilename(title,'xlsx'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'The workbook could not be exported.')}
  }
  return <div className="workspace-export-actions">
    <button type="button" disabled={empty} onClick={download}>Export {props.patientId === undefined ? 'cohort' : 'patient'} (XLSX)</button>
    {empty && <span>Select patients and parameters first.</span>}
    {error && <p role="alert">Export failed: {error}</p>}
  </div>
}

export function ChartExportActions({getSvg,title}: {getSvg:()=>SVGSVGElement | null;title:string}) {
  const [error,setError] = useState<string | null>(null)
  const [busy,setBusy] = useState(false)
  async function download(format: 'svg'|'png') {
    setError(null)
    setBusy(true)
    try {
      const element = getSvg()
      if (!element) throw new Error('No chart available. Select data and parameters first.')
      const chart = exportChartSvg(element,title)
      if (format === 'svg') downloadBlob(chart.svg,safeExportFilename(title,'svg'),'image/svg+xml;charset=utf-8')
      else {
        const blob = await svgStringToPngBlob(chart.svg,chart.width,chart.height)
        if (!blob.size) throw new Error('The PNG file is empty.')
        downloadBlob(new Uint8Array(await blob.arrayBuffer()),safeExportFilename(title,'png'),'image/png')
      }
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'The chart could not be exported.')}
    finally {setBusy(false)}
  }
  return <div className="workspace-export-actions" role="group" aria-label={`Export chart: ${title}`}>
    <button type="button" disabled={busy} onClick={() => void download('svg')}>Download SVG</button>
    <button type="button" disabled={busy} onClick={() => void download('png')}>Download PNG</button>
    {busy && <span role="status">Exporting chart …</span>}
    {error && <p role="alert">Export failed: {error}</p>}
  </div>
}
