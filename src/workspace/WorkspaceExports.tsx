import { useState } from 'react'
import { downloadBlob, svgStringToPngBlob, zipBytes } from '../io/export'
import { exportChartSvg, safeExportFilename, workspaceWorkbookBytes, type WorkspaceExportInput } from './workspace-export'
import './exports-workspace.css'

export function WorkspaceExportActions(props: WorkspaceExportInput & { getCharts?: () => Array<{ title: string; svg: SVGSVGElement }> }) {
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
  function downloadBundle() {
    setError(null)
    try {
      const files: Record<string, Uint8Array> = {
        [safeExportFilename(`Patient-${props.patientId}`, 'xlsx')]: workspaceWorkbookBytes(props),
      }
      for (const [index, chart] of (props.getCharts?.() ?? []).entries()) {
        // Numbering preserves distinct charts even when sanitised labels collide.
        files[`${index + 1}-${safeExportFilename(chart.title, 'svg')}`] = new TextEncoder().encode(exportChartSvg(chart.svg, chart.title).svg)
      }
      downloadBlob(zipBytes(files), safeExportFilename(`Patient-${props.patientId}-bundle`, 'zip'), 'application/zip')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The patient bundle could not be exported.') }
  }
  return <div className="workspace-export-actions">
    <button type="button" disabled={empty} onClick={download}>Export {props.patientId === undefined ? 'cohort' : 'patient'} (XLSX)</button>
    {props.patientId !== undefined && props.getCharts && <button type="button" disabled={empty} onClick={downloadBundle}>Export patient bundle (ZIP)</button>}
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
