import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildCohortRows, type CohortCell } from '../core/cohort/screening'
import { comparePatientIds, type LabRow, type PatientId } from '../core/types'
import { slopeQualityLabel } from '../ui/qualityLabels'
import { workspaceSpecs, type WorkspaceData } from './workspace-data'
import { WorkspaceExportActions } from './WorkspaceExports'
import { WorkspacePlot, boundedPrefix, measurementText, formatWorkspaceDate, formatWorkspaceNumber, type WorkspaceAxis } from './WorkspacePlot'
import './trajectories-workspace.css'
import { WorkspaceSparkline, type SparkDomain } from './WorkspaceSparkline'
import { sexLabel } from './workspace-labels'
import type { FitConfig, FitModel, TimeBalancing, UnknownDialysisPolicy } from '../core/fitPipeline/types'
import { isRapidEgfrDecline } from '../core/analysis/rapidEgfrDeclineModule'
import { defaultFitSettings, endpointBadge, toFitConfig, type WorkspaceFitSettings } from './workspace-analysis'

function CellSummary({
  cell,
  fit,
  measurements,
  rapidEgfrThreshold = 5,
}: {
  cell: CohortCell
  fit: boolean
  measurements: LabRow[]
  rapidEgfrThreshold?: number
}) {
  const last = cell.points[cell.points.length - 1]
  const lastSource = measurements.filter(row => row.labDatum && row.wertNum !== null).at(-1)
  const quality = slopeQualityLabel(cell)
  const qualityText = quality?.label === 'no values'
    ? 'No numeric measurements'
    : quality?.label === 'no fit values'
      ? 'No fitted measurements'
      : quality?.label === '< 1 yr'
        ? 'Follow-up < 1 year'
        : quality?.label

  const modelLabel = cell.fitModel === 'theil-sen'
    ? 'Theil–Sen'
    : cell.fitModel === 'rolling-ols'
      ? 'Rolling OLS'
      : cell.fitModel === 'segmented-ols'
        ? 'Segmented OLS'
        : cell.fitModel === 'none'
          ? 'No fit'
          : 'OLS'

  const rapid = isRapidEgfrDecline(cell.einheit, cell.slope, rapidEgfrThreshold)
  const endpoint = endpointBadge(cell.endpoints, Number.isFinite(cell.slope))

  return <div className="wt-cell-summary">
    <strong>{last ? `${boundedPrefix(lastSource?.wertOperator)}${formatWorkspaceNumber(last.value)}` : 'No measurements'}</strong>
    <span>{last ? `${formatWorkspaceDate(last.date)} · ${cell.nNumeric} measurements` : 'No numeric measurements with a date'}</span>
    {fit && <>
      <span>
        {cell.fitModel === 'none'
          ? 'Fit model disabled'
          : Number.isFinite(cell.slope)
            ? `${modelLabel}: ${formatWorkspaceNumber(cell.slope)} ${cell.einheit ?? ''}/year · R² ${formatWorkspaceNumber(cell.r2)}`
            : 'No fit available'}
      </span>
      <span>
        {cell.nFitted !== cell.nNumeric
          ? `${cell.nFitted} fitted of ${cell.nNumeric} measurements · ${cell.fittedSpanDays} days`
          : `${cell.nFitted} fitted measurements · ${cell.fittedSpanDays} days`}
      </span>
      {quality && <span className={quality.caveat ? 'wt-warning' : 'wt-muted'}>{qualityText}{quality.caveat ? ' · uncertain slope' : ''}</span>}
      {endpoint && <span className="wt-badge wt-badge-endpoint" title={endpoint.title}>{endpoint.label}</span>}
      {rapid && <span className="wt-badge wt-badge-rapid" title={`Rapid decline: slope < -${rapidEgfrThreshold} /year`}>rapid ↓</span>}
    </>}
    {cell.akiChip && <span className="wt-badge wt-badge-aki" title={cell.akiSummary}>{cell.akiChip}</span>}
    {fit && cell.excludedIdx.length > 0 && <span className="wt-muted">{cell.excludedIdx.length} excluded by censoring/AKI</span>}
  </div>
}

export function TrajectoriesWorkspace({ data, requestedPatientId }: { data: WorkspaceData; requestedPatientId?: PatientId | null }) {
  const [parameterKeys, setParameterKeys] = useState(() => data.parameters.slice(0, 3).map(p => p.key))
  const [draftKeys, setDraftKeys] = useState<string[] | null>(null)
  const [parameterQuery, setParameterQuery] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PatientId[]>([])
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [groupBy, setGroupBy] = useState('')
  const [group, setGroup] = useState('')
  const [sort, setSort] = useState('id')
  const [mode, setMode] = useState<'table' | 'overlay' | 'detail'>('table')
  const [patientId, setPatientId] = useState<PatientId | null>(null)
  const [returnMode, setReturnMode] = useState<'table' | 'overlay'>('table')
  const [axis, setAxis] = useState<WorkspaceAxis>('baseline')
  const [scaleMode, setScaleMode] = useState<'shared' | 'zoom'>('shared')
  const [highlight, setHighlight] = useState<PatientId | null>(null)
  const [display, setDisplay] = useState({ points: true, connect: true, events: false })
  const [fitKeys, setFitKeys] = useState<string[]>([])
  const [fitSettings, setFitSettings] = useState<WorkspaceFitSettings>(() => defaultFitSettings('general_exploration'))

  const applyPreset = (presetId: string) => {
    setFitSettings(defaultFitSettings(presetId))
  }
  const updateSettings = (patch: Partial<WorkspaceFitSettings>) => {
    setFitSettings(prev => ({
      ...prev,
      ...patch,
      presetId: 'custom',
    }))
  }

  const dialog = useRef<HTMLDialogElement>(null)
  const pickerButton = useRef<HTMLButtonElement>(null)
  const tableScroller = useRef<HTMLDivElement>(null)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const personButtons = useRef(new Map<PatientId, HTMLButtonElement>())
  const originatingPerson = useRef<PatientId | null>(null)
  const parameterHeaders = useRef(new Map<string, HTMLTableCellElement>())
  const tablePosition = useRef({ left: 0, top: 0, restore: false })
  const knownParameters = useRef(new Map(data.parameters.map(parameter => [parameter.key, parameter])))
  const [parameterNotice, setParameterNotice] = useState('')
  useEffect(() => {
    const replacements = new Map<string, string>()
    const nextDerived = data.parameters.filter(parameter => parameter.derived)
    for (const key of parameterKeys) {
      if (!data.parameters.some(parameter => parameter.key === key) && knownParameters.current.get(key)?.derived && nextDerived.length === 1) replacements.set(key, nextDerived[0].key)
    }
    if (replacements.size) {
      setParameterKeys(previous => [...new Set(previous.map(key => replacements.get(key) ?? key))])
      setFitKeys(previous => [...new Set(previous.map(key => replacements.get(key) ?? key))])
      setParameterNotice(`The selected eGFR derivation was updated to ${nextDerived[0].label}.`)
    } else {
      const added = nextDerived.filter(parameter => !knownParameters.current.has(parameter.key))
      if (added.length) {
        setParameterKeys(previous => [...new Set([...previous, ...added.map(parameter => parameter.key)])])
        setParameterNotice(`Added derived parameter: ${added.map(parameter => parameter.label).join(', ')}. Imported parameter selections are unchanged.`)
      }
    }
    for (const parameter of data.parameters) knownParameters.current.set(parameter.key, parameter)
  }, [data.parameters, parameterKeys])
  const unavailable = parameterKeys.filter(key => !data.parameters.some(parameter => parameter.key === key)).map(key => knownParameters.current.get(key)?.label ?? key)
  const measurementsBySeries = useMemo(() => {
    const map = new Map<string, LabRow[]>()
    for (const row of data.rows) {
      const key = JSON.stringify([row.patientId, row.bezeichnung, row.einheit])
      const bucket = map.get(key) ?? []; bucket.push(row); map.set(key, bucket)
    }
    for (const rows of map.values()) rows.sort((a, b) => (a.labDatum?.getTime() ?? Infinity) - (b.labDatum?.getTime() ?? Infinity))
    return map
  }, [data.rows])
  const measurementsFor = (id: PatientId, cell: { bezeichnung: string; einheit: string | null }) => measurementsBySeries.get(JSON.stringify([id, cell.bezeichnung, cell.einheit])) ?? []
  // Root remounts this component only when rawRows identity changes. A derived
  // update can remove a parameter without discarding unrelated browser choices.
  const keys = useMemo(() => parameterKeys.filter(key => data.parameters.some(p => p.key === key)), [parameterKeys, data.parameters])
  const parameters = useMemo(() => keys.flatMap(key => data.parameters.filter(p => p.key === key)), [keys, data.parameters])
  const fitConfigs = useMemo(() => {
    const map: Record<string, FitConfig> = {}
    for (const p of parameters) {
      map[p.key] = toFitConfig(fitSettings, p)
    }
    return map
  }, [parameters, fitSettings])
  const specs = useMemo(() => workspaceSpecs(data, keys, fitConfigs), [data, keys, fitConfigs])
  const cohort = useMemo(() => buildCohortRows(data.rows, data.patients.map(p => p.id), specs), [data.rows, data.patients, specs])
  const sparkDomains = useMemo(() => specs.map((_, index): SparkDomain => {
    let min = Infinity, max = -Infinity, days = 0
    for (const row of cohort) {
      const cell = row.cells[index]
      const first = cell.points[0]?.date.getTime()
      for (const point of cell.points) { min = Math.min(min, point.value); max = Math.max(max, point.value); days = Math.max(days, (point.date.getTime() - first) / 86_400_000) }
      for (const line of cell.fitLines) for (const point of line) { if (Number.isFinite(point.value)) { min = Math.min(min, point.value); max = Math.max(max, point.value) } }
    }
    if (!Number.isFinite(min)) return { min: 0, max: 1, days: 1 }
    min = Math.min(0, min); max = Math.max(0, max)
    if (min === max) max = min + 1
    return { min, max, days }
  }), [cohort, specs])
  const attributes = [...new Set(data.patients.flatMap(p => Object.keys(p.attributes)))].sort()
  const groupValue = (id: PatientId) => data.patientAttributes[String(id)]?.[groupBy] || 'Not recorded'
  const groupLabel = (value: string) => groupBy === 'sex' ? sexLabel(value) : value
  const groups = [...new Set(data.patients.map(p => groupValue(p.id)))].sort()
  const filtered = cohort.filter(row => {
    const patient = data.patients.find(p => p.id === row.patientId)
    return (!selectedOnly || selected.includes(row.patientId)) && (!group || groupValue(row.patientId) === group) && `${row.patientId} ${patient?.label ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  }).sort((a, b) => {
    const index = keys.indexOf(sort)
    if (index < 0) return comparePatientIds(a.patientId, b.patientId)
    const left = a.cells[index].points.at(-1)?.value, right = b.cells[index].points.at(-1)?.value
    return left === undefined ? right === undefined ? comparePatientIds(a.patientId, b.patientId) : 1 : right === undefined ? -1 : right - left || comparePatientIds(a.patientId, b.patientId)
  })
  const visible = filtered.map(row => groupBy ? { ...row, groupValue: groupValue(row.patientId) } : row)
  const zoomDomains = specs.map((_, index): SparkDomain => {
    let min = Infinity, max = -Infinity
    for (const row of visible) {
      for (const point of row.cells[index].points) { min = Math.min(min, point.value); max = Math.max(max, point.value) }
      if (fitKeys.includes(keys[index])) for (const line of row.cells[index].fitLines) for (const point of line) {
        if (Number.isFinite(point.value)) { min = Math.min(min, point.value); max = Math.max(max, point.value) }
      }
    }
    if (!Number.isFinite(min)) return sparkDomains[index]
    const pad = (max - min || Math.abs(max) || 1) * .08
    return { min: min - pad, max: max + pad, days: sparkDomains[index].days }
  })
  const patientIds = visible.map(row => row.patientId)
  const current = visible.find(row => row.patientId === patientId) ?? visible[0]
  const currentIndex = visible.findIndex(row => row.patientId === current?.patientId)
  const open = (id: PatientId) => {
    if (mode === 'table') {
      tablePosition.current = { left: tableScroller.current?.scrollLeft ?? 0, top: document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop, restore: true }
      originatingPerson.current = id
    }
    const nextReturn = mode !== 'detail' ? mode : returnMode
    setReturnMode(nextReturn)
    setPatientId(id)
    setMode('detail')
    if (typeof window !== 'undefined' && window.history?.pushState) {
      window.history.pushState({ page: 'Trajectories', mode: 'detail', patientId: id, returnMode: nextReturn }, '')
    }
  }
  useLayoutEffect(() => {
    if (mode === 'detail') {
      detailHeading.current?.focus()
      return
    }
    if (mode !== 'table' || !tableScroller.current) return
    tableScroller.current.scrollLeft = tablePosition.current.left
    if (tablePosition.current.restore) {
      if (originatingPerson.current !== null) personButtons.current.get(originatingPerson.current)?.focus({ preventScroll: true })
      const page = document.scrollingElement ?? document.documentElement
      page.scrollTop = tablePosition.current.top
      tablePosition.current.restore = false
    }
  }, [mode])
  const jumpParameter = (key: string) => {
    const header = parameterHeaders.current.get(key), scroller = tableScroller.current
    if (!header || !scroller) return
    const stickyWidth = Array.from(scroller.querySelectorAll('thead th')).slice(0, 2).reduce((sum, element) => sum + element.getBoundingClientRect().width, 0)
    const headerRect = header.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const idx = keys.indexOf(key)
    const delta = headerRect.width > 0
      ? headerRect.left - scrollerRect.left - stickyWidth
      : ((idx >= 0 ? (idx + 1) * 200 : 350))
    scroller.scrollLeft = Math.max(0, scroller.scrollLeft + delta)
    tablePosition.current.left = scroller.scrollLeft
  }
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as { page?: string; mode?: 'table' | 'overlay' | 'detail'; patientId?: PatientId; returnMode?: 'table' | 'overlay' } | null
      if (state?.mode === 'table' || state?.mode === 'overlay' || state?.mode === 'detail') {
        if (state.mode === 'table') tablePosition.current.restore = true
        if (state.mode === 'detail' && state.patientId !== undefined) {
          setPatientId(state.patientId)
        }
        if (state.returnMode) setReturnMode(state.returnMode)
        setMode(state.mode)
      } else if (state?.page === 'Trajectories') {
        tablePosition.current.restore = true
        setMode('table')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => {
    if (requestedPatientId === undefined || requestedPatientId === null) return
    setQuery(''); setGroup(''); setSelectedOnly(false); setPatientId(requestedPatientId); setReturnMode('table'); setMode('detail')
  }, [requestedPatientId])
  useEffect(() => {
    if (draftKeys !== null && dialog.current && !dialog.current.open && typeof dialog.current.showModal === 'function') dialog.current.showModal()
  }, [draftKeys])
  const closePicker = () => { dialog.current?.close?.(); setDraftKeys(null); pickerButton.current?.focus() }
  const toggleFit = (key: string) => setFitKeys(previous => previous.includes(key) ? previous.filter(k => k !== key) : [...previous, key])
  if (!data.patients.length) return <section className="card"><h1>Patients and trajectories</h1><p>No data loaded yet. Import a CSV or Excel file, or load demo data under Data.</p></section>
    const fitModelLabel = fitSettings.fitModel === 'theil-sen'
      ? 'Theil–Sen, slope and R²'
      : fitSettings.fitModel === 'rolling-ols'
        ? 'Rolling OLS, slope and R²'
        : fitSettings.fitModel === 'segmented-ols'
          ? 'Segmented OLS, slope and R²'
          : fitSettings.fitModel === 'none'
            ? 'No fit line'
            : 'OLS, slope and R²'

    return <div className="wt-workspace">
    <header className="page-heading"><p className="eyebrow">PATIENTS & TRAJECTORIES</p><h1>Explore trajectories</h1><p>{data.patients.length} patients · {data.parameters.length} parameters · {data.fileName ?? 'Loaded data'}</p></header>
    {parameterNotice && <p className="notice" role="status">{parameterNotice}</p>}
    {unavailable.length > 0 && <p className="notice" role="status">Unavailable selected parameters: {unavailable.join(', ')}. The derivation is disabled or currently produces no computable values. The selection is retained for recalculation; unavailable parameters are excluded from exports.</p>}
    <section className="card wt-controls" aria-label="Shared selection">
      <div className="wt-toolbar"><button ref={pickerButton} onClick={() => { setParameterQuery(''); setDraftKeys([...keys]) }}>Choose parameters</button><span>{parameters.length} parameters selected</span><WorkspaceExportActions data={data} parameterKeys={keys} patientIds={patientIds} cohortRows={visible} fitConfigByParameterKey={fitConfigs} {...(mode === 'detail' && current ? { patientId: current.patientId } : {})} /></div>
      <div className="wt-control-grid">
        <label>Search patients<input value={query} onChange={event => setQuery(event.target.value)} placeholder="ID or name" /></label>
        <label>Group by<select value={groupBy} onChange={event => { setGroupBy(event.target.value); setGroup('') }}><option value="">No grouping</option>{attributes.map(attribute => <option key={attribute}>{attribute}</option>)}</select></label>
        <label>Filter group<select value={group} disabled={!groupBy} onChange={event => setGroup(event.target.value)}><option value="">All groups</option>{groupBy && groups.map(value => <option key={value} value={value}>{groupLabel(value)}</option>)}</select></label>
        <label>Sort by<select value={keys.includes(sort) ? sort : 'id'} onChange={event => setSort(event.target.value)}><option value="id">Patient ID</option>{parameters.map(p => <option key={p.key} value={p.key}>Latest value: {p.label} ↓</option>)}</select></label>
      </div>
      <div className="wt-toolbar"><label><input type="checkbox" checked={selectedOnly} onChange={event => setSelectedOnly(event.target.checked)} /> Selected patients only</label><span>{selected.length} selected · {visible.length} in the shared scope</span><button onClick={() => setSelected(previous => [...new Set([...previous, ...patientIds])])} disabled={!patientIds.length}>Select visible patients</button><button onClick={() => setSelected([])} disabled={!selected.length}>Clear selection</button></div>
    </section>
    <div className="wt-view-switch" role="group" aria-label="View"><button aria-pressed={mode === 'table'} onClick={() => {
      if (mode !== 'table') {
        if (mode === 'detail') tablePosition.current.restore = true
        setMode('table')
        if (typeof window !== 'undefined' && window.history?.pushState) window.history.pushState({ page: 'Trajectories', mode: 'table' }, '')
      }
    }}>Table</button><button aria-pressed={mode === 'overlay'} onClick={() => {
      if (mode !== 'overlay') {
        setMode('overlay')
        if (typeof window !== 'undefined' && window.history?.pushState) window.history.pushState({ page: 'Trajectories', mode: 'overlay' }, '')
      }
    }}>Overlay</button><button aria-pressed={mode === 'detail'} disabled={!current} onClick={() => {
      if (mode !== 'detail' && current) open(current.patientId)
    }}>Individual patient</button></div>
    <label className="wt-scale-control">Value scale<select aria-label="Value scale" value={scaleMode} onChange={event => setScaleMode(event.target.value as 'shared' | 'zoom')}><option value="shared">Shared parameter scale</option><option value="zoom">Zoom to visible values</option></select><span className="wt-muted">{scaleMode === 'shared' ? 'Full-dataset range including zero, consistent across patients and views.' : 'Visible values only; small changes appear larger.'}</span></label>
    <details className="card wt-analysis-card"><summary>Display and analysis</summary>
      <div className="wt-preset-section">
        <div className="wt-preset-bar">
          <label>Analysis preset
            <select
              aria-label="Analysis preset"
              value={fitSettings.presetId}
              onChange={event => applyPreset(event.target.value)}
            >
              <optgroup label="Standard / General">
                <option value="general_exploration">General exploration (unweighted OLS)</option>
                <option value="theil_sen">Theil–Sen robust trend (outlier resistant)</option>
              </optgroup>
              <optgroup label="Nephrology (CKD / AKI)">
                <option value="ckd_progression">CKD progression (quarterly medians, censoring, AKI exclusion)</option>
                <option value="acute_review">Acute review (day-level raw points, no fit)</option>
              </optgroup>
              {fitSettings.presetId === 'custom' && (
                <optgroup label="Custom">
                  <option value="custom">Custom configuration</option>
                </optgroup>
              )}
            </select>
          </label>
          <span className="wt-muted">
            {fitSettings.presetId === 'ckd_progression'
              ? 'CKD progression: quarterly medians, censored after transplant and chronic dialysis, 30-day AKI exclusion, G5 endpoints, OLS trend.'
              : fitSettings.presetId === 'theil_sen'
                ? 'Theil–Sen: non-parametric median slope, unweighted, resistant to outliers.'
                : fitSettings.presetId === 'acute_review'
                  ? 'Acute review: day-level measurements without trend fit, focusing on KDIGO AKI.'
                  : fitSettings.presetId === 'custom'
                    ? 'Custom: tailored fit model, event censoring, exclusions, time balancing, or endpoints.'
                    : 'General exploration: global OLS per patient and parameter, unweighted individual measurements, no AKI or event exclusions, and no time aggregation. Slopes are per year. Changing the axis affects the display, not the calculation.'}
          </span>
        </div>
        <div className="wt-fit-options">
          {parameters.map(p => (
            <label key={p.key}>
              <input
                type="checkbox"
                checked={fitKeys.includes(p.key)}
                onChange={() => toggleFit(p.key)}
              />{' '}
              {fitModelLabel}: {p.label}
            </label>
          ))}
        </div>
        <details className="wt-advanced-settings">
          <summary>Advanced pipeline settings (model, censoring, balancing, endpoints)</summary>
          <div className="wt-pipeline-grid">
            <div className="wt-pipeline-group">
              <h4>1. Fit model</h4>
              <label>Model
                <select
                  aria-label="Fit model"
                  value={fitSettings.fitModel}
                  onChange={e => updateSettings({ fitModel: e.target.value as FitModel })}
                >
                  <option value="ols">OLS (Ordinary Least Squares)</option>
                  <option value="theil-sen">Theil–Sen (robust median slope)</option>
                  <option value="rolling-ols">Rolling OLS</option>
                  <option value="segmented-ols">Segmented OLS</option>
                  <option value="none">None (no fit line)</option>
                </select>
              </label>
            </div>
            <div className="wt-pipeline-group">
              <h4>2. Time balancing</h4>
              <label>Aggregation
                <select
                  aria-label="Time balancing"
                  value={fitSettings.timeBalancing}
                  onChange={e => updateSettings({ timeBalancing: e.target.value as TimeBalancing })}
                >
                  <option value="raw">Raw (unweighted points)</option>
                  <option value="monthly-median">Monthly median</option>
                  <option value="quarterly-median">Quarterly median</option>
                </select>
              </label>
            </div>
            <div className="wt-pipeline-group">
              <h4>3. Clinical events & censoring</h4>
              <label>
                <input
                  type="checkbox"
                  aria-label="Censor after kidney transplant"
                  checked={fitSettings.censoring.censorAfterKidneyTransplant}
                  onChange={e => updateSettings({
                    censoring: { ...fitSettings.censoring, censorAfterKidneyTransplant: e.target.checked }
                  })}
                />
                Censor after kidney transplant
              </label>
              <label>
                <input
                  type="checkbox"
                  aria-label="Censor after chronic dialysis"
                  checked={fitSettings.censoring.censorAfterChronicDialysis}
                  onChange={e => updateSettings({
                    censoring: { ...fitSettings.censoring, censorAfterChronicDialysis: e.target.checked }
                  })}
                />
                Censor after chronic dialysis
              </label>
              <label>
                <input
                  type="checkbox"
                  aria-label="Exclude acute dialysis intervals"
                  checked={fitSettings.censoring.excludeAcuteDialysisPeriods}
                  onChange={e => updateSettings({
                    censoring: { ...fitSettings.censoring, excludeAcuteDialysisPeriods: e.target.checked }
                  })}
                />
                Exclude acute dialysis intervals
              </label>
              <label>Unknown dialysis
                <select
                  aria-label="Unknown dialysis policy"
                  value={fitSettings.censoring.unknownDialysisPolicy}
                  onChange={e => updateSettings({
                    censoring: { ...fitSettings.censoring, unknownDialysisPolicy: e.target.value as UnknownDialysisPolicy }
                  })}
                >
                  <option value="flag-only">Flag only</option>
                  <option value="exclude-dated-interval">Exclude dated interval</option>
                  <option value="censor-from-start">Censor from start</option>
                </select>
              </label>
            </div>
            <div className="wt-pipeline-group">
              <h4>4. AKI exclusions (KDIGO)</h4>
              <label>
                <input
                  type="checkbox"
                  aria-label="Exclude AKI windows from fit"
                  checked={fitSettings.exclusions.excludeAkiWindows}
                  onChange={e => updateSettings({
                    exclusions: { ...fitSettings.exclusions, excludeAkiWindows: e.target.checked }
                  })}
                />
                Exclude AKI windows from fit
              </label>
              <label>Exclusion window (days)
                <input
                  type="number"
                  min={0}
                  aria-label="AKI exclusion days"
                  value={fitSettings.exclusions.akiExclusionDays}
                  onChange={e => updateSettings({
                    exclusions: { ...fitSettings.exclusions, akiExclusionDays: Math.max(0, Number(e.target.value) || 0) }
                  })}
                />
              </label>
            </div>
            <div className="wt-pipeline-group">
              <h4>5. Endpoints & thresholds</h4>
              <label>
                <input
                  type="checkbox"
                  aria-label="Percent eGFR decline"
                  checked={fitSettings.endpoints.percentDecline}
                  onChange={e => updateSettings({
                    endpoints: { ...fitSettings.endpoints, percentDecline: e.target.checked }
                  })}
                />
                Percent eGFR decline
              </label>
              <label>
                <input
                  type="checkbox"
                  aria-label="Observed CKD G5"
                  checked={fitSettings.endpoints.observedCkdG5}
                  onChange={e => updateSettings({
                    endpoints: { ...fitSettings.endpoints, observedCkdG5: e.target.checked }
                  })}
                />
                Observed CKD G5
              </label>
              <label>
                <input
                  type="checkbox"
                  aria-label="Projected age to CKD G5"
                  checked={fitSettings.endpoints.projectedAgeToCkdG5}
                  onChange={e => updateSettings({
                    endpoints: { ...fitSettings.endpoints, projectedAgeToCkdG5: e.target.checked }
                  })}
                />
                Projected age to CKD G5
              </label>
              <label>Rapid decline ≥ (mL/min/1.73m²/yr)
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  aria-label="Rapid decline threshold"
                  value={fitSettings.rapidEgfrThreshold}
                  onChange={e => updateSettings({
                    rapidEgfrThreshold: Math.max(0, Number(e.target.value) || 0)
                  })}
                />
              </label>
            </div>
          </div>
        </details>
      </div>
    </details>
    {mode !== 'table' && <section className="card wt-control-grid" aria-label="Plot settings"><label>Time axis<select value={axis} onChange={event => setAxis(event.target.value as WorkspaceAxis)}><option value="baseline">Years since first measurement</option><option value="calendar">Calendar date</option><option value="age">Age</option></select></label><label>Highlight patient<select value={highlight === null ? '' : String(patientIds.indexOf(highlight))} onChange={event => setHighlight(event.target.value === '' ? null : patientIds[Number(event.target.value)] ?? null)}><option value="">None</option>{patientIds.map((id, i) => <option key={String(id)} value={i}>{id}</option>)}</select></label><div className="wt-toolbar">{(['points', 'connect', 'events'] as const).map(key => <label key={key}><input type="checkbox" checked={display[key]} onChange={event => setDisplay(previous => ({ ...previous, [key]: event.target.checked }))} />{key === 'points' ? 'Measurement points' : key === 'connect' ? 'Connecting lines' : 'Events'}</label>)}</div></section>}
    {mode === 'table' && parameters.length > 0 && <div className="wt-toolbar"><label>Jump to parameter<select defaultValue="" onChange={event => { jumpParameter(event.target.value); event.target.value = '' }}><option value="" disabled>Choose parameters …</option>{parameters.map(parameter => <option key={parameter.key} value={parameter.key}>{parameter.label}</option>)}</select></label><span className="wt-muted">{scaleMode === 'shared' ? 'Shared parameter scales.' : 'Zoomed visible-value scales.'} Time since first measurement; patient IDs stay visible while scrolling.</span></div>}
    {!visible.length && <p className="card">No matching patients. Change the search, group filter, or selection.</p>}
    {!parameters.length && <p className="card">Select at least one parameter.</p>}
    {mode === 'table' && visible.length > 0 && <div ref={tableScroller} onScroll={event => { tablePosition.current.left = event.currentTarget.scrollLeft }} className="wt-table-scroll" tabIndex={0} role="region" aria-label="Patient table, horizontal scrolling"><table className="wt-table"><thead><tr><th title="Selection"><span className="sr-only">Selection</span><input type="checkbox" aria-label="Select all visible patients" title="Select all visible patients" ref={element => { if (element) { element.indeterminate = visible.some(r => selected.includes(r.patientId)) && !visible.every(r => selected.includes(r.patientId)) } }} checked={visible.length > 0 && visible.every(r => selected.includes(r.patientId))} onChange={event => setSelected(event.target.checked ? [...new Set([...selected, ...patientIds])] : selected.filter(id => !patientIds.includes(id)))} /></th><th>Patient</th>{parameters.map(p => <th key={p.key} ref={element => { if (element) parameterHeaders.current.set(p.key, element); else parameterHeaders.current.delete(p.key) }}>{p.label}{p.derived ? ' · derived' : ''}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={String(row.patientId)}><td><input type="checkbox" aria-label={`Select patient ${row.patientId}`} checked={selected.includes(row.patientId)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.patientId] : previous.filter(id => id !== row.patientId))} /></td><th scope="row"><button ref={element => { if (element) personButtons.current.set(row.patientId, element); else personButtons.current.delete(row.patientId) }} aria-label={`Open patient ${row.patientId}`} title={String(row.patientId)} onClick={() => open(row.patientId)}>{row.patientId}</button>{groupBy && <small>{groupLabel(groupValue(row.patientId))}</small>}</th>{row.cells.map((cell, i) => <td key={keys[i]}><WorkspaceSparkline scaleMode={scaleMode} cell={cell} measurements={measurementsFor(row.patientId, cell)} patientId={row.patientId} label={parameters[i].label} domain={scaleMode === 'shared' ? sparkDomains[i] : zoomDomains[i]} fit={fitKeys.includes(keys[i])} /><CellSummary cell={cell} fit={fitKeys.includes(keys[i])} measurements={measurementsFor(row.patientId, cell)} rapidEgfrThreshold={fitSettings.rapidEgfrThreshold} /></td>)}</tr>)}</tbody></table></div>}
    {mode === 'overlay' && <div className="wt-plot-grid">{parameters.map((parameter, index) => <WorkspacePlot key={`${parameter.key}-${groupBy}`} data={data} parameter={parameter} parameterIndex={index} sharedDomain={sparkDomains[index]} scaleMode={scaleMode} cohortRows={visible} axis={axis} groupBy={groupBy} highlight={highlight} display={display} showFit={fitKeys.includes(parameter.key)} onOpen={open} />)}</div>}
    {mode === 'detail' && current && <section><div className="wt-toolbar"><button type="button" className="wt-back-button" aria-label={`Back to ${returnMode}`} onClick={() => {
      if (returnMode === 'table') tablePosition.current.restore = true
      setMode(returnMode)
      if (typeof window !== 'undefined' && window.history?.pushState) window.history.pushState({ page: 'Trajectories', mode: returnMode }, '')
    }}>← Back to {returnMode}</button><h2 ref={detailHeading} tabIndex={-1}>Patient {current.patientId}</h2><button disabled={currentIndex <= 0} onClick={() => {
      const nextId = visible[currentIndex - 1].patientId
      setPatientId(nextId)
      if (typeof window !== 'undefined' && window.history?.replaceState) window.history.replaceState({ page: 'Trajectories', mode: 'detail', patientId: nextId, returnMode }, '')
    }}>Previous patient</button><label>Open patient directly<select value={currentIndex} onChange={event => {
      const nextId = visible[Number(event.target.value)].patientId
      setPatientId(nextId)
      if (typeof window !== 'undefined' && window.history?.replaceState) window.history.replaceState({ page: 'Trajectories', mode: 'detail', patientId: nextId, returnMode }, '')
    }}>{visible.map((row, index) => <option key={String(row.patientId)} value={index}>{row.patientId}</option>)}</select></label><button disabled={currentIndex >= visible.length - 1} onClick={() => {
      const nextId = visible[currentIndex + 1].patientId
      setPatientId(nextId)
      if (typeof window !== 'undefined' && window.history?.replaceState) window.history.replaceState({ page: 'Trajectories', mode: 'detail', patientId: nextId, returnMode }, '')
    }}>Next patient</button><span>{currentIndex + 1} / {visible.length}</span></div><div className="wt-plot-grid">{parameters.map((parameter, index) => {
      const measurements = measurementsFor(current.patientId, parameter)
      return <div key={parameter.key}><WorkspacePlot data={data} parameter={parameter} parameterIndex={index} sharedDomain={sparkDomains[index]} scaleMode={scaleMode} cohortRows={[current]} axis={axis} groupBy="" highlight={null} display={display} showFit={fitKeys.includes(parameter.key)} onOpen={open} /><div className="card"><CellSummary cell={current.cells[index]} fit={fitKeys.includes(parameter.key)} measurements={measurements} rapidEgfrThreshold={fitSettings.rapidEgfrThreshold} /><details open={!current.cells[index].points.length || axis === 'age' && data.patients.find(p => p.id === current.patientId)?.baselineAge === null}><summary>Show measurements ({measurements.length})</summary><div className="wt-table-scroll"><table aria-label={`Measurements ${parameter.label}`}><thead><tr><th>Date</th><th>{parameter.derived ? 'Derived value' : 'Original value'}</th><th>Numeric value</th><th>Age</th></tr></thead><tbody>{measurements.map((row, i) => <tr key={i}><td>{row.labDatum ? formatWorkspaceDate(row.labDatum) : 'Missing date'}</td><td>{measurementText(row)}</td><td>{row.wertNum === null ? 'Non-numeric / missing' : `${boundedPrefix(row.wertOperator)}${formatWorkspaceNumber(row.wertNum)}`}</td><td>{row.patientAgeAtLab === null ? 'Missing' : formatWorkspaceNumber(row.patientAgeAtLab)}</td></tr>)}</tbody></table></div>{!measurements.length && <p>No measurements available for this parameter.</p>}</details></div></div>
    })}</div><section className="card"><h3>Events for this patient</h3>{data.events.some(e => e.patientId === current.patientId) ? <ul>{data.events.filter(e => e.patientId === current.patientId).map((event, i) => <li key={i}>{formatWorkspaceDate(event.date)}: {event.title}{event.endDate ? ` to ${formatWorkspaceDate(event.endDate)}` : ''}{event.description ? ` · ${event.description}` : ''}</li>)}</ul> : <p>No events recorded.</p>}</section></section>}
    {draftKeys !== null && <dialog ref={dialog} open={typeof HTMLDialogElement.prototype.showModal !== 'function' ? true : undefined} onCancel={event => { event.preventDefault(); closePicker() }} aria-labelledby="wt-parameter-title" className="wt-parameter-dialog"><h2 id="wt-parameter-title">Select parameters</h2><label>Search parameters<input autoFocus value={parameterQuery} onChange={event => setParameterQuery(event.target.value)} /></label><div className="wt-toolbar"><button onClick={() => setDraftKeys(data.parameters.map(p => p.key))}>All parameters</button><button onClick={() => setDraftKeys([])}>No parameters</button></div><div className="wt-parameter-options">{data.parameters.filter(p => p.label.toLocaleLowerCase().includes(parameterQuery.toLocaleLowerCase())).map(p => <label key={p.key}><input type="checkbox" checked={draftKeys.includes(p.key)} onChange={event => setDraftKeys(previous => event.target.checked ? [...previous!, p.key] : previous!.filter(key => key !== p.key))} />{p.label}</label>)}</div><div className="wt-toolbar"><button onClick={() => { setParameterKeys(draftKeys); closePicker() }}>Apply</button><button onClick={closePicker}>Cancel</button></div></dialog>}
  </div>
}
