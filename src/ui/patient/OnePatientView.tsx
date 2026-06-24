import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../state/store'
import { SeriesPlot } from '../charts/SeriesPlot'
import { COMPUTED_BEZEICHNUNG_SUFFIX } from '../../core/egfr/series'
import { svgElementToString, downloadBlob, svgStringToPngBlob, sheetsToXlsxBytes, zipBytes, fileStamp } from '../../io/export'
import type { LabRow } from '../../core/types'
import type { PlotModeConfig } from '../../core/stats/slopeLines'
import { fitInputForSeries } from '../../core/analysis/types'
import type { AkiEpisode } from '../../core/aki/kdigo'
import type { CohortSeriesSpec } from '../../core/cohort/screening'
import { patientWorkbookSheets } from '../../core/patient/patientExport'
import { eventTooltip } from '../../core/events/events'
import { clinicalEventAffectsFit } from '../../core/events/fitExclusions'

/** Title -> live SVG accessor. Lets the parent collect chart SVGs for the ZIP
 * export from React-registered nodes instead of scraping the DOM by CSS class. */
type SvgRegistry = Map<string, () => SVGSVGElement | null>

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_')

interface PlotCardProps {
  title: string
  seriesRows: LabRow[]
  cfg: PlotModeConfig
  computed: boolean
  creatinine: boolean
  showAki: boolean
  events: { date: Date; label: string; tooltip?: string }[]
  episodes?: AkiEpisode[]
  connect: boolean
  register: (title: string, getter: (() => SVGSVGElement | null) | null) => void
}

function PlotCard({ title, seriesRows, cfg, computed, creatinine, showAki, events, episodes, connect, register }: PlotCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  const svgEl = useCallback((): SVGSVGElement | null => {
    return (cardRef.current?.querySelector('svg') as SVGSVGElement | null) ?? null
  }, [])

  useEffect(() => {
    register(title, svgEl)
    return () => register(title, null)
  }, [title, svgEl, register])

  function dlSvg() {
    const s = svgEl()
    if (s) downloadBlob(svgElementToString(s), `${safeName(title)}.svg`, 'image/svg+xml')
  }

  async function dlPng() {
    const s = svgEl()
    if (!s) return
    const w = s.width?.baseVal?.value || 760
    const h = s.height?.baseVal?.value || 240
    const blob = await svgStringToPngBlob(svgElementToString(s), w, h)
    downloadBlob(new Uint8Array(await blob.arrayBuffer()), `${safeName(title)}.png`, 'image/png')
  }

  return (
    <div ref={cardRef} className="plot-card" data-title={title}>
      <SeriesPlot
        title={title}
        rows={seriesRows}
        cfg={cfg}
        computed={computed}
        events={events}
        showAki={showAki}
        creatinine={creatinine}
        episodes={episodes}
        connect={connect}
      />
      <div className="chart-export">
        <button aria-label={`Download ${title} as SVG`} onClick={dlSvg}>SVG</button>
        <button aria-label={`Download ${title} as PNG`} onClick={dlPng}>PNG</button>
      </div>
    </div>
  )
}

export function OnePatientView() {
  const analysisResult = useAppStore((s) => s.analysisResult())
  const displayRows = analysisResult.rows
  const patientId = useAppStore((s) => s.selectedPatientId)
  const configs = useAppStore((s) => s.seriesConfigs)
  const events = useAppStore((s) => s.events)
  const showEvents = useAppStore((s) => s.showEvents)
  const showAki = useAppStore((s) => s.showAki)
  const connectPoints = useAppStore((s) => s.connectPoints)
  const returnToCohort = useAppStore((s) => s.returnToCohort)
  const setReturnToCohort = useAppStore((s) => s.setReturnToCohort)
  const setView = useAppStore((s) => s.setView)

  const svgGetters = useRef<SvgRegistry>(new Map())
  const register = useCallback<PlotCardProps['register']>((title, getter) => {
    if (getter) svgGetters.current.set(title, getter)
    else svgGetters.current.delete(title)
  }, [])

  const patientClinicalEvents = useMemo(
    () => patientId === null ? [] : events.filter((event) => event.patientId === patientId),
    [events, patientId],
  )
  const specs: CohortSeriesSpec[] = useMemo(
    () => configs
      .filter((c) => c.bezeichnung)
      .map((c) => ({
        bezeichnung: c.bezeichnung as string,
        einheit: c.einheit,
        mode: c.mode,
        gapDays: c.gapDays,
        windowDays: c.windowDays,
        stepDays: c.stepDays,
        cutoffDays: c.cutoffDays,
        exclusionDays: c.exclusionDays,
        fitConfig: c.fitConfig,
        fitInputs: analysisResult.fitInputs,
        eventDates: patientClinicalEvents
          .filter((event) => clinicalEventAffectsFit(event, c.fitConfig.censoring))
          .map((event) => event.date),
        clinicalEvents: patientClinicalEvents,
      })),
    [configs, analysisResult.fitInputs, patientClinicalEvents],
  )
  const canExport = specs.length > 0

  function buildWorkbook(): Uint8Array {
    return sheetsToXlsxBytes(patientWorkbookSheets(displayRows, patientId as number, specs, patientClinicalEvents))
  }

  function exportXlsx() {
    downloadBlob(buildWorkbook(), `patient-${patientId}-${fileStamp()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  function exportZip() {
    const files: Record<string, Uint8Array> = { [`patient-${patientId}.xlsx`]: buildWorkbook() }
    for (const [title, getSvg] of svgGetters.current) {
      const svg = getSvg()
      if (svg) files[`${safeName(title)}.svg`] = new TextEncoder().encode(svgElementToString(svg))
    }
    downloadBlob(zipBytes(files), `patient-${patientId}-bundle-${fileStamp()}.zip`, 'application/zip')
  }

  if (patientId === null) return <p className="empty-state">No patient selected. Pick a patient in the toolbar.</p>

  return (
    <div className="one-patient">
      <div className="patient-exports">
        {returnToCohort && (
          <button className="icon-text-button" onClick={() => { setReturnToCohort(false); setView('cohort') }}>
            <span aria-hidden="true" className="button-icon">←</span>
            Back to cohort
          </button>
        )}
        <button disabled={!canExport} title="Workbook: measurements + slopes (with units, R², CI) + disclaimer" onClick={exportXlsx}>Export workbook (xlsx)</button>
        <button disabled={!canExport} title="ZIP: the workbook plus one SVG per chart" onClick={exportZip}>Export bundle (zip + charts)</button>
        {!canExport && <span className="export-hint">Pick a parameter to enable export.</span>}
      </div>
      {configs.map((cfg, i) => {
        if (!cfg.bezeichnung) return <p key={i} className="series-empty">Series {i + 1}: pick a parameter above.</p>
        const seriesRows = displayRows.filter(
          (r) => r.patientId === patientId && r.bezeichnung === cfg.bezeichnung && (r.einheit ?? null) === (cfg.einheit ?? null),
        )
        const title = cfg.einheit ? `${cfg.bezeichnung} (${cfg.einheit})` : cfg.bezeichnung
        const computed = cfg.bezeichnung?.includes(COMPUTED_BEZEICHNUNG_SUFFIX) ?? false
        const creatinine = /(kreatinin|creatinin)/i.test(cfg.bezeichnung ?? '') && (cfg.einheit ?? '').toLowerCase() === 'mg/dl'
        const patientEventDates = patientClinicalEvents
          .filter((event) => clinicalEventAffectsFit(event, cfg.fitConfig.censoring))
          .map((event) => event.date)
        const patientEvents = showEvents
          ? patientClinicalEvents.map((event) => ({ date: event.date, label: event.title, tooltip: eventTooltip(event) }))
          : []
        const plotCfg = {
          ...cfg,
          eventDates: patientEventDates,
          clinicalEvents: patientClinicalEvents,
          clinicalEventCensoring: cfg.fitConfig.censoring,
          excludeAkiWindows: cfg.fitConfig.exclusions.excludeAkiWindows,
          fitModel: cfg.fitConfig.fitModel,
          timeBalancing: cfg.fitConfig.timeBalancing,
        }
        const fitInput = fitInputForSeries(analysisResult.fitInputs, patientId, { bezeichnung: cfg.bezeichnung, einheit: cfg.einheit ?? null })
        const episodes = fitInput?.episodes.length ? fitInput.episodes : undefined
        return (
          <PlotCard
            key={i}
            title={title}
            seriesRows={seriesRows}
            cfg={plotCfg}
            computed={computed}
            creatinine={creatinine}
            showAki={showAki}
            events={patientEvents}
            episodes={episodes}
            connect={connectPoints}
            register={register}
          />
        )
      })}
    </div>
  )
}
