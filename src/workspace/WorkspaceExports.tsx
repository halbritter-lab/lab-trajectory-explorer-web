import { useRef, useState } from 'react'
import { downloadBlob, svgStringToPngBlob, zipBytes } from '../io/export'
import { exportChartSvg, safeExportFilename, workspaceWorkbookBytes, type WorkspaceExportInput } from './workspace-export'
import { useAppStore } from './state/store'
import './exports-workspace.css'
import { renderedInEnglish, t } from '../i18n'

/** Lets the browser draw the "Exporting …" status before the workbook is
 * written: writing blocks the page, for a second or more with a large cohort.
 * The timeout covers a tab that paints no frame. */
const afterPaint = () => new Promise<void>(resolve => {
  const timeout = setTimeout(resolve, 100)
  if (typeof requestAnimationFrame !== 'function') return
  requestAnimationFrame(() => setTimeout(() => { clearTimeout(timeout); resolve() }, 0))
})

export function WorkspaceExportActions(input: WorkspaceExportInput & { getCharts?: () => Array<{ title: string; svg: SVGSVGElement }> }) {
  // The Data page's peri-event selection lives in the store beside the dataset, not in the analysis settings.
  const periEventSettings = useAppStore(s => s.periEventSettings)
  const props = { ...input, periEventSettings: input.periEventSettings ?? periEventSettings }
  const [error,setError] = useState<string | null>(null)
  const [busy,setBusy] = useState(false)
  const empty = props.parameterKeys.length === 0 || props.patientIds.length === 0 || (props.patientId !== undefined && !props.patientIds.includes(props.patientId))
  // The cohort export holds the visible patients: say so on the button when that is not everyone.
  const total = props.data.patients.length
  const cohortLabel = !empty && props.patientIds.length < total ? t('Export {n} of {total} patients (XLSX)', { n: props.patientIds.length, total }) : t('Export cohort (XLSX)')
  async function run(fallback: string, write: () => void) {
    setError(null)
    setBusy(true)
    await afterPaint()
    try { write() }
    catch (cause) { setError(cause instanceof Error ? cause.message : fallback) }
    finally { setBusy(false) }
  }
  const download = () => run(t('The workbook could not be exported.'), () => {
    const bytes = workspaceWorkbookBytes(props)
    const title = props.patientId === undefined ? 'cohort' : `Patient-${props.patientId}`
    downloadBlob(bytes,safeExportFilename(title,'xlsx'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })
  const downloadBundle = () => run(t('The patient bundle could not be exported.'), () => {
    const files: Record<string, Uint8Array> = {
      [safeExportFilename(`Patient-${props.patientId}`, 'xlsx')]: workspaceWorkbookBytes(props),
    }
    // Charts are copied from the page, rendered in English for the export (issue #71).
    renderedInEnglish(() => {
      for (const [index, chart] of (props.getCharts?.() ?? []).entries()) {
        // Numbering preserves distinct charts even when sanitised labels collide.
        files[`${index + 1}-${safeExportFilename(chart.title, 'svg')}`] = new TextEncoder().encode(exportChartSvg(chart.svg, chart.title).svg)
      }
    })
    downloadBlob(zipBytes(files), safeExportFilename(`Patient-${props.patientId}-bundle`, 'zip'), 'application/zip')
  })
  return <div className="workspace-export-actions">
    <button type="button" disabled={empty || busy} onClick={() => void download()}>{props.patientId === undefined ? cohortLabel : t('Export patient (XLSX)')}</button>
    {props.patientId !== undefined && props.getCharts && <button type="button" disabled={empty || busy} onClick={() => void downloadBundle()}>{t('Export patient bundle (ZIP)')}</button>}
    {busy && <span role="status">{t('Exporting …')}</span>}
    {empty && <span>{t('Select patients and parameters first.')}</span>}
    {error && <p role="alert">{t('Export failed: {error}', { error })}</p>}
  </div>
}

export function ChartExportActions({getSvg,title}: {getSvg:()=>SVGSVGElement | null;title:string}) {
  const [error,setError] = useState<string | null>(null)
  const [busy,setBusy] = useState(false)
  // The title of the English rendering the export is copied from (issue #71).
  const currentTitle = useRef(title)
  currentTitle.current = title
  async function download(format: 'svg'|'png') {
    setError(null)
    setBusy(true)
    try {
      if (!getSvg()) throw new Error(t('No chart available. Select data and parameters first.'))
      const chart = renderedInEnglish(() => ({ ...exportChartSvg(getSvg()!,currentTitle.current), title: currentTitle.current }))
      const title = chart.title
      if (format === 'svg') downloadBlob(chart.svg,safeExportFilename(title,'svg'),'image/svg+xml;charset=utf-8')
      else {
        const blob = await svgStringToPngBlob(chart.svg,chart.width,chart.height)
        if (!blob.size) throw new Error(t('The PNG file is empty.'))
        downloadBlob(new Uint8Array(await blob.arrayBuffer()),safeExportFilename(title,'png'),'image/png')
      }
    } catch (cause) {setError(cause instanceof Error ? cause.message : t('The chart could not be exported.'))}
    finally {setBusy(false)}
  }
  return <div className="workspace-export-actions" role="group" aria-label={t('Export chart: {title}', { title })}>
    <button type="button" disabled={busy} onClick={() => void download('svg')}>{t('Download SVG')}</button>
    <button type="button" disabled={busy} onClick={() => void download('png')}>{t('Download PNG')}</button>
    {busy && <span role="status">{t('Exporting chart …')}</span>}
    {error && <p role="alert">{t('Export failed: {error}', { error })}</p>}
  </div>
}
