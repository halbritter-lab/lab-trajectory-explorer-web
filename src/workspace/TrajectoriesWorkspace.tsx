import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildCohortRows, cohortCellFlags, type CohortCell } from '../core/cohort/screening'
import type { ColumnModuleSettings } from '../core/analysis/registry'
import { comparePatientIds, type LabRow, type PatientId } from '../core/types'
import { slopeQualityLabel } from './labels/qualityLabels'
import { workspaceSpecs, type WorkspaceData } from './workspace-data'
import { WorkspaceExportActions } from './WorkspaceExports'
import { DEFAULT_WORKSPACE_DISPLAY, OVERLAY_MODULES, WorkspacePlot, boundedPrefix, measurementText, formatWorkspaceDate, formatWorkspaceNumber, type WorkspaceAxis, type WorkspaceDisplay } from './WorkspacePlot'
import './trajectories-workspace.css'
import { WorkspaceSparkline, type SparkDomain } from './WorkspaceSparkline'
import { sexLabel } from './workspace-labels'
import { measurementFitStatus } from './measurement-fit-status'
import type { FitConfig } from '../core/analysis/fitConfig'
import { WorkspaceAnalysisSettings } from './WorkspaceAnalysisSettings'
import { defaultFitSettings, endpointBadge, toFitConfig, type WorkspaceFitSettings } from './workspace-analysis'

/** Sort keys are `${parameterKey}:${metric}`; parameter keys are JSON and may
 * themselves contain ':', so split at the last one. */
function parseSortKey(sort: string): { paramKey: string; metric: string } {
  const separator = sort.lastIndexOf(':')
  return separator >= 0
    ? { paramKey: sort.slice(0, separator), metric: sort.slice(separator + 1) || 'latest' }
    : { paramKey: sort, metric: 'latest' }
}

/** Default direction per metric: slopes ascending (steepest decline first),
 * everything else descending (largest first). The direction toggle reverses it. */
const metricAscendingByDefault = (metric: string) => metric === 'slope'
const metricArrow = (ascending: boolean) => ascending ? '↑' : '↓'
const metricShortLabel: Record<string, string> = { latest: 'val', slope: 'slope', absSlope: '|slope|', n: 'n', duration: 'dur' }
const TABLE_PAGE_SIZE = 50

function CellSummary({
  cell,
  patientId,
  fit,
  measurements,
  columnSettings,
  detailed = false,
}: {
  cell: CohortCell
  patientId: PatientId
  fit: boolean
  measurements: LabRow[]
  /** The column's own module settings (e.g. its rapid-decline threshold). */
  columnSettings: ColumnModuleSettings
  /** Patient view: the slope-quality explanation is shown as text, not hidden. */
  detailed?: boolean
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

  // cell.fitModel is the scalar estimator; rolling and segmented runs are OLS
  // fits whose path is recorded in cell.mode.
  const modelLabel = cell.fitModel === 'theil-sen'
    ? 'Theil–Sen'
    : cell.mode === 'rolling'
      ? 'Rolling OLS'
      : cell.mode === 'gap-split'
        ? 'Segmented OLS'
        : cell.fitModel === 'none'
          ? 'No fit'
          : 'OLS'

  const flags = cohortCellFlags(cell, patientId, columnSettings)
  const badge = (flag: (typeof flags)[number]) => <details key={flag.id} className="wt-badge-details"><summary className={`wt-badge wt-badge-${flag.tone}`} title={flag.title}>{flag.label}</summary><p>{flag.title}</p></details>
  const endpoint = endpointBadge(cell.endpoints, cell.points.length)
  const markedReasons = cell.pointExclusionReasons.map(reasons => reasons.filter(reason => cell.fitModel !== 'none' || reason === 'censored-value'))
  const markedCount = markedReasons.filter(reasons => reasons.length > 0).length
  const markedLabels = [...new Set(markedReasons.flat())].map(reason => reason === 'censored-value' ? 'censored values' : reason)

  return <div className="wt-cell-summary">
    <strong>{last ? `${boundedPrefix(lastSource?.wertOperator)}${formatWorkspaceNumber(last.value)}` : 'No measurements'}</strong>
    <span>{last ? `${formatWorkspaceDate(last.date)} · ${cell.nNumeric} ${cell.nNumeric === 1 ? 'measurement' : 'measurements'}` : 'No numeric measurements with a date'}</span>
    {fit && <>
      <span>
        {cell.fitModel === 'none'
          ? 'Fit model disabled'
          : Number.isFinite(cell.slope)
            ? `${modelLabel}: ${formatWorkspaceNumber(cell.slope)} ${cell.einheit ?? ''}/year · R² ${formatWorkspaceNumber(cell.r2)}`
            : 'No fit available'}
      </span>
      {Number.isFinite(cell.ciLow) && Number.isFinite(cell.ciHigh) && <span title="Uncertainty in the estimated slope; not a prediction interval for future measurements">95% slope CI [{formatWorkspaceNumber(cell.ciLow)}, {formatWorkspaceNumber(cell.ciHigh)}] {cell.einheit ?? ''}/year</span>}
      <span>
        {cell.nFitted !== cell.nNumeric
          ? `${cell.nFitted} fitted of ${cell.nNumeric} ${cell.nNumeric === 1 ? 'measurement' : 'measurements'} · ${cell.fittedSpanDays} days`
          : `${cell.nFitted} fitted ${cell.nFitted === 1 ? 'measurement' : 'measurements'} · ${cell.fittedSpanDays} days`}
      </span>
      {quality && (detailed
        ? <p role="note" className={`wt-quality-note ${quality.caveat ? 'wt-warning' : 'wt-muted'}`}><strong>{qualityText}{quality.caveat ? ' · uncertain slope' : ''}</strong>: {quality.title}</p>
        : <>
          <span className={quality.caveat ? 'wt-warning' : 'wt-muted'} title={quality.title}>{qualityText}{quality.caveat ? ' · uncertain slope' : ''}</span>
          {/* Tooltips are unreachable by keyboard and touch; the disclosure is not. */}
          <details className="wt-quality-details"><summary>{quality.caveat ? 'Why is the slope uncertain?' : 'Why is there no slope?'}</summary><p>{quality.title}</p></details>
        </>)}
      {flags.filter(flag => flag.requiresFit).map(badge)}
    </>}
    {endpoint && <><span className="wt-badge wt-badge-endpoint" title={endpoint.title}>{endpoint.label}</span><details><summary>Endpoint details</summary><p>{endpoint.title}</p></details></>}
    {flags.filter(flag => !flag.requiresFit).map(badge)}
    {markedCount > 0 && <span className="wt-muted">{markedCount} excluded from the fit ({markedLabels.join(', ')})</span>}
  </div>
}

export function TrajectoriesWorkspace({ data, requestedPatientId }: { data: WorkspaceData; requestedPatientId?: PatientId | null }) {
  const [parameterKeys, setParameterKeys] = useState(() => data.parameters.slice(0, 3).map(p => p.key))
  const [draftKeys, setDraftKeys] = useState<string[] | null>(null)
  const [parameterQuery, setParameterQuery] = useState('')
  const [query, setQuery] = useState('')
  const [tablePage, setTablePage] = useState(0)
  const [selected, setSelected] = useState<PatientId[]>([])
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [groupBy, setGroupBy] = useState('')
  const [group, setGroup] = useState('')
  const [sort, setSortKey] = useState('id')
  const [sortReversed, setSortReversed] = useState(false)
  const setSort = (next: string) => { setSortKey(next); setSortReversed(false); setTablePage(0) }
  const [mode, setMode] = useState<'table' | 'overlay' | 'detail'>('table')
  const [patientId, setPatientId] = useState<PatientId | null>(null)
  const [returnMode, setReturnMode] = useState<'table' | 'overlay'>('table')
  const [axis, setAxis] = useState<WorkspaceAxis>('baseline')
  const [scaleMode, setScaleMode] = useState<'shared' | 'zoom'>('shared')
  const [highlight, setHighlight] = useState<PatientId | null>(null)
  const [display, setDisplay] = useState<WorkspaceDisplay>(DEFAULT_WORKSPACE_DISPLAY)
  const [fitKeys, setFitKeys] = useState<string[]>([])
  const [fitSettings, setFitSettings] = useState<WorkspaceFitSettings>(() => defaultFitSettings('general_exploration'))

  const [columnSettings, setColumnSettings] = useState<Record<string, WorkspaceFitSettings>>({})
  const [requestedSettingsScope, setSettingsScope] = useState('')
  const settingsScope = parameterKeys.includes(requestedSettingsScope) && data.parameters.some(p => p.key === requestedSettingsScope) ? requestedSettingsScope : ''
  const changeSettings = (settings: WorkspaceFitSettings) => {
    if (settingsScope) setColumnSettings(previous => ({ ...previous, [settingsScope]: settings }))
    else setFitSettings(settings)
  }
  const resetColumnSettings = () => setColumnSettings(previous => {
    const next = { ...previous }
    delete next[settingsScope]
    return next
  })

  const workspaceElement = useRef<HTMLDivElement>(null)
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
      setColumnSettings(previous => {
        const next = { ...previous }
        for (const [oldKey, newKey] of replacements) {
          if (previous[oldKey] && !next[newKey]) next[newKey] = previous[oldKey]
          delete next[oldKey]
        }
        return next
      })
      setSettingsScope(previous => replacements.get(previous) ?? previous)
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
      map[p.key] = toFitConfig(columnSettings[p.key] ?? fitSettings, p)
    }
    return map
  }, [parameters, fitSettings, columnSettings])
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
  const attributes = useMemo(() => [...new Set(data.patients.flatMap(p => Object.keys(p.attributes)))].sort(), [data.patients])
  const patientById = useMemo(() => new Map(data.patients.map(patient => [patient.id, patient])), [data.patients])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const groupValue = (id: PatientId) => data.patientAttributes[String(id)]?.[groupBy] || 'Not recorded'
  const groupLabel = (value: string) => groupBy === 'sex' ? sexLabel(value) : value
  const groups = [...new Set(data.patients.map(p => groupValue(p.id)))].sort()
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = cohort.filter(row => {
    const patient = patientById.get(row.patientId)
    return (!selectedOnly || selectedSet.has(row.patientId)) && (!group || groupValue(row.patientId) === group) && `${row.patientId} ${patient?.label ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
  }).sort((a, b) => {
    if (sort === 'id') return comparePatientIds(a.patientId, b.patientId)
    if (sort === 'id:desc') return comparePatientIds(b.patientId, a.patientId)
    const { paramKey, metric } = parseSortKey(sort)
    const index = keys.indexOf(paramKey)
    if (index < 0) return comparePatientIds(a.patientId, b.patientId)
    const cellA = a.cells[index]
    const cellB = b.cells[index]
    let valA: number | undefined
    let valB: number | undefined

    if (metric === 'slope') {
      valA = Number.isFinite(cellA?.slope) ? cellA.slope : undefined
      valB = Number.isFinite(cellB?.slope) ? cellB.slope : undefined
    } else if (metric === 'absSlope') {
      valA = Number.isFinite(cellA?.slope) ? Math.abs(cellA.slope) : undefined
      valB = Number.isFinite(cellB?.slope) ? Math.abs(cellB.slope) : undefined
    } else if (metric === 'n') {
      valA = cellA?.nNumeric ?? 0
      valB = cellB?.nNumeric ?? 0
    } else if (metric === 'duration') {
      valA = cellA?.spanDays ?? 0
      valB = cellB?.spanDays ?? 0
    } else {
      valA = cellA?.points.at(-1)?.value
      valB = cellB?.points.at(-1)?.value
    }
    const ascending = metricAscendingByDefault(metric) !== sortReversed

    if (valA === undefined && valB === undefined) return comparePatientIds(a.patientId, b.patientId)
    if (valA === undefined) return 1
    if (valB === undefined) return -1
    const diff = ascending ? valA - valB : valB - valA
    return diff || comparePatientIds(a.patientId, b.patientId)
  })
  const visible = filtered.map(row => groupBy ? { ...row, groupValue: groupValue(row.patientId) } : row)
  const pageCount = Math.ceil(visible.length / TABLE_PAGE_SIZE)
  const activeTablePage = Math.min(tablePage, Math.max(0, pageCount - 1))
  const tableRows = visible.slice(activeTablePage * TABLE_PAGE_SIZE, (activeTablePage + 1) * TABLE_PAGE_SIZE)
  const visibleSelectedCount = visible.reduce((count, row) => count + Number(selectedSet.has(row.patientId)), 0)
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
  const activeSort = sort === 'id' || sort === 'id:desc' ? null : parseSortKey(sort)
  const activeMetric = activeSort && keys.includes(activeSort.paramKey) ? activeSort.metric : null
  const sortAscending = activeMetric ? metricAscendingByDefault(activeMetric) !== sortReversed : true
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
    return <div className="wt-workspace" ref={workspaceElement}>
    <header className="page-heading"><p className="eyebrow">PATIENTS & TRAJECTORIES</p><h1>Explore trajectories</h1><p>{data.patients.length} {data.patients.length === 1 ? 'patient' : 'patients'} · {data.parameters.length} {data.parameters.length === 1 ? 'parameter' : 'parameters'} · {data.fileName ?? 'Loaded data'}</p></header>
    {parameterNotice && <p className="notice" role="status">{parameterNotice}</p>}
    {unavailable.length > 0 && <p className="notice" role="status">Unavailable selected parameters: {unavailable.join(', ')}. The derivation is disabled or currently produces no computable values. The selection is retained for recalculation; unavailable parameters are excluded from exports.</p>}
    <section className="card wt-controls" aria-label="Shared selection">
      <div className="wt-toolbar"><button ref={pickerButton} onClick={() => { setParameterQuery(''); setDraftKeys([...keys]) }}>Choose parameters</button><span>{parameters.length} parameters selected</span><WorkspaceExportActions data={data} parameterKeys={keys} patientIds={patientIds} cohortRows={visible} fitConfigByParameterKey={fitConfigs} moduleSettingsByParameterKey={Object.fromEntries(parameters.map(p => [p.key, (columnSettings[p.key] ?? fitSettings).moduleSettings]))} {...(mode === 'detail' && current ? { patientId: current.patientId,
        getCharts: () => [...(workspaceElement.current?.querySelectorAll<SVGSVGElement>('.wt-plot-card svg.wt-plot') ?? [])].map(svg => ({
          svg, title: `Patient ${current.patientId} · ${svg.closest('.wt-plot-card')?.querySelector('h3')?.textContent ?? 'Chart'}`,
        })) } : {})} /></div>
      <div className="wt-control-grid">
        <label>Search patients<input value={query} onChange={event => { setQuery(event.target.value); setTablePage(0) }} placeholder="ID or name" /></label>
        <label>Group by<select value={groupBy} onChange={event => { setGroupBy(event.target.value); setGroup(''); setTablePage(0) }}><option value="">No grouping</option>{attributes.map(attribute => <option key={attribute}>{attribute}</option>)}</select></label>
        <label>Filter group<select value={group} disabled={!groupBy} onChange={event => { setGroup(event.target.value); setTablePage(0) }}><option value="">All groups</option>{groupBy && groups.map(value => <option key={value} value={value}>{groupLabel(value)}</option>)}</select></label>
        <label>Sort by
          <select
            aria-label="Sort by"
            value={keys.some(k => sort.startsWith(k)) ? (sort.includes(':') ? sort : `${sort}:latest`) : (sort === 'id:desc' ? 'id:desc' : 'id')}
            onChange={event => setSort(event.target.value)}
          >
            <option value="id">Patient ID (A → Z)</option>
            <option value="id:desc">Patient ID (Z → A)</option>
            {parameters.map(p => (
              <optgroup key={p.key} label={p.label}>
                <option value={`${p.key}:latest`}>Latest value: {p.label}</option>
                <option value={`${p.key}:slope`}>Slope: {p.label}</option>
                <option value={`${p.key}:absSlope`}>Absolute slope: {p.label}</option>
                <option value={`${p.key}:n`}>Number of measurements: {p.label}</option>
                <option value={`${p.key}:duration`}>Duration: {p.label}</option>
              </optgroup>
            ))}
          </select>
        </label>
        {activeMetric && <div className="wt-sort-direction" role="group" aria-label="Sort direction">
          <button type="button" aria-pressed={sortReversed} onClick={() => { setSortReversed(previous => !previous); setTablePage(0) }}>Reverse order</button>
          <span className="wt-muted" role="status">{metricArrow(sortAscending)} {sortAscending ? 'Lowest first' : 'Highest first'}{activeMetric === 'slope' && !sortReversed ? ' (steepest decline first)' : ''}{activeMetric === 'n' || activeMetric === 'duration' ? '' : '; patients without a value last'}</span>
        </div>}
      </div>
      <div className="wt-toolbar"><label><input type="checkbox" checked={selectedOnly} onChange={event => { setSelectedOnly(event.target.checked); setTablePage(0) }} /> Selected patients only</label><span>{selected.length} selected · {visible.length} in the shared scope</span><button onClick={() => setSelected(previous => [...new Set([...previous, ...patientIds])])} disabled={!patientIds.length}>Select visible patients</button><button onClick={() => setSelected([])} disabled={!selected.length}>Clear selection</button></div>
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
      <WorkspaceAnalysisSettings parameters={parameters} sharedSettings={fitSettings} overrides={columnSettings}
        scope={settingsScope} onScopeChange={setSettingsScope} onChange={changeSettings} onReset={resetColumnSettings}
        fitKeys={fitKeys} onToggleFit={toggleFit} />
    </details>
    {mode !== 'table' && <section className="card wt-control-grid" aria-label="Plot settings"><label>Time axis<select value={axis} onChange={event => setAxis(event.target.value as WorkspaceAxis)}><option value="baseline">Years since first measurement</option><option value="calendar">Calendar date</option><option value="age">Age</option></select></label><label>Highlight patient<select value={highlight === null ? '' : String(patientIds.indexOf(highlight))} onChange={event => setHighlight(event.target.value === '' ? null : patientIds[Number(event.target.value)] ?? null)}><option value="">None</option>{patientIds.map((id, i) => <option key={String(id)} value={i}>{id}</option>)}</select></label><div className="wt-toolbar">{(['points', 'connect', 'events'] as const).map(key => <label key={key}><input type="checkbox" checked={display[key]} onChange={event => setDisplay(previous => ({ ...previous, [key]: event.target.checked }))} />{key === 'points' ? 'Measurement points' : key === 'connect' ? 'Connecting lines' : 'Events'}</label>)}{OVERLAY_MODULES.map(module => <label key={module.id}><input type="checkbox" checked={display[module.id] ?? false} onChange={event => setDisplay(previous => ({ ...previous, [module.id]: event.target.checked }))} />{module.presentation.toggleLabel}</label>)}</div></section>}
    {mode === 'table' && parameters.length > 0 && <div className="wt-toolbar"><label>Jump to parameter<select defaultValue="" onChange={event => { jumpParameter(event.target.value); event.target.value = '' }}><option value="" disabled>Choose parameters …</option>{parameters.map(parameter => <option key={parameter.key} value={parameter.key}>{parameter.label}</option>)}</select></label><span className="wt-muted">{scaleMode === 'shared' ? 'Shared parameter scales.' : 'Zoomed visible-value scales.'} Time since first measurement; patient IDs stay visible while scrolling.</span></div>}
    {!visible.length && <p className="card">No matching patients. Change the search, group filter, or selection.</p>}
    {!parameters.length && <p className="card">Select at least one parameter.</p>}
    {mode === 'table' && visible.length > 0 && <nav className="wt-table-pages" aria-label="Patient table pages"><button type="button" aria-label="Previous table page" disabled={activeTablePage === 0} onClick={() => setTablePage(activeTablePage - 1)}>Previous</button><span role="status">Showing {activeTablePage * TABLE_PAGE_SIZE + 1}–{Math.min((activeTablePage + 1) * TABLE_PAGE_SIZE, visible.length)} of {visible.length} {visible.length === 1 ? 'patient' : 'patients'}</span><button type="button" aria-label="Next table page" disabled={activeTablePage >= pageCount - 1} onClick={() => setTablePage(activeTablePage + 1)}>Next</button></nav>}
    {mode === 'table' && visible.length > 0 && <div ref={tableScroller} onScroll={event => { tablePosition.current.left = event.currentTarget.scrollLeft }} className="wt-table-scroll" tabIndex={0} role="region" aria-label="Patient table, horizontal scrolling"><table className="wt-table"><thead><tr><th title="Selection"><span className="sr-only">Selection</span><input type="checkbox" aria-label="Select all visible patients" title="Select all visible patients" ref={element => { if (element) { element.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length } }} checked={visible.length > 0 && visibleSelectedCount === visible.length} onChange={event => { const scopeIds = new Set(patientIds); setSelected(event.target.checked ? [...new Set([...selected, ...patientIds])] : selected.filter(id => !scopeIds.has(id))) }} /></th><th aria-label="Patient"><button type="button" aria-hidden="true" tabIndex={-1} className="wt-sort-header-button" onClick={() => setSort(sort === 'id' ? 'id:desc' : 'id')}>Patient {sort === 'id' ? '↑' : sort === 'id:desc' ? '↓' : ''}</button></th>{parameters.map(p => {
      const parsedSort = parseSortKey(sort)
      const metric = parsedSort.paramKey === p.key ? parsedSort.metric : null
      const metricLabel = metric && metricShortLabel[metric] ? `${metricArrow(metricAscendingByDefault(metric) !== sortReversed)} ${metricShortLabel[metric]}` : null
      return (
        <th key={p.key} aria-label={p.derived ? `${p.label} · derived` : p.label} ref={element => { if (element) parameterHeaders.current.set(p.key, element); else parameterHeaders.current.delete(p.key) }}>
          <div className="wt-th-content">
            <span>{p.label}{p.derived ? ' · derived' : ''}</span>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className={`wt-sort-header-button ${metric ? 'active' : ''}`}
              title={`Sort by ${p.label}`}
              onClick={() => {
                if (sort === `${p.key}:latest`) setSort(`${p.key}:slope`)
                else if (sort === `${p.key}:slope`) setSort(`${p.key}:absSlope`)
                else if (sort === `${p.key}:absSlope`) setSort(`${p.key}:n`)
                else if (sort === `${p.key}:n`) setSort(`${p.key}:duration`)
                else if (sort === `${p.key}:duration`) setSort('id')
                else setSort(`${p.key}:latest`)
              }}
            >
              {metricLabel ?? '↕'}
            </button>
          </div>
        </th>
      )
    })}</tr></thead><tbody>{tableRows.map(row => <tr key={String(row.patientId)}><td><input type="checkbox" aria-label={`Select patient ${row.patientId}`} checked={selectedSet.has(row.patientId)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.patientId] : previous.filter(id => id !== row.patientId))} /></td><th scope="row"><button ref={element => { if (element) personButtons.current.set(row.patientId, element); else personButtons.current.delete(row.patientId) }} aria-label={`Open patient ${row.patientId}`} title={String(row.patientId)} onClick={() => open(row.patientId)}>{row.patientId}</button>{groupBy && <small>{groupLabel(groupValue(row.patientId))}</small>}</th>{row.cells.map((cell, i) => <td key={keys[i]}><WorkspaceSparkline scaleMode={scaleMode} cell={cell} measurements={measurementsFor(row.patientId, cell)} patientId={row.patientId} label={parameters[i].label} domain={scaleMode === 'shared' ? sparkDomains[i] : zoomDomains[i]} fit={fitKeys.includes(keys[i])} /><CellSummary cell={cell} patientId={row.patientId} fit={fitKeys.includes(keys[i])} measurements={measurementsFor(row.patientId, cell)} columnSettings={(columnSettings[keys[i]] ?? fitSettings).moduleSettings} /></td>)}</tr>)}</tbody></table></div>}
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
      const fitStatus = measurementFitStatus(measurements, current.cells[index])
      return <div key={parameter.key}><WorkspacePlot data={data} parameter={parameter} parameterIndex={index} sharedDomain={sparkDomains[index]} scaleMode={scaleMode} cohortRows={[current]} axis={axis} groupBy="" highlight={null} display={display} showFit={fitKeys.includes(parameter.key)} onOpen={open} /><div className="card"><CellSummary detailed cell={current.cells[index]} patientId={current.patientId} fit={fitKeys.includes(parameter.key)} measurements={measurements} columnSettings={(columnSettings[parameter.key] ?? fitSettings).moduleSettings} /><details open={!current.cells[index].points.length || axis === 'age' && data.patients.find(p => p.id === current.patientId)?.baselineAge === null}><summary>Show measurements ({measurements.length})</summary><div className="wt-table-scroll"><table aria-label={`Measurements ${parameter.label}`}><thead><tr><th>Date</th><th>{parameter.derived ? 'Derived value' : 'Original value'}</th><th>Numeric value</th><th>Age</th><th>Fit preparation</th></tr></thead><tbody>{measurements.map((row, i) => <tr key={i}><td>{row.labDatum ? formatWorkspaceDate(row.labDatum) : 'Missing date'}</td><td>{measurementText(row)}</td><td>{row.wertNum === null ? 'Non-numeric / missing' : `${boundedPrefix(row.wertOperator)}${formatWorkspaceNumber(row.wertNum)}`}</td><td>{row.patientAgeAtLab === null ? 'Missing' : formatWorkspaceNumber(row.patientAgeAtLab)}</td><td>{fitStatus[i]}</td></tr>)}</tbody></table></div>{!measurements.length && <p>No measurements available for this parameter.</p>}</details></div></div>
    })}</div><section className="card"><h3>Events for this patient</h3>{data.events.some(e => e.patientId === current.patientId) ? <ul>{data.events.filter(e => e.patientId === current.patientId).map((event, i) => <li key={i}>{formatWorkspaceDate(event.date)}: {event.title}{event.endDate ? ` to ${formatWorkspaceDate(event.endDate)}` : ''}{event.description ? ` · ${event.description}` : ''}</li>)}</ul> : <p>No events recorded.</p>}</section></section>}
    {draftKeys !== null && <dialog ref={dialog} open={typeof HTMLDialogElement.prototype.showModal !== 'function' ? true : undefined} onCancel={event => { event.preventDefault(); closePicker() }} aria-labelledby="wt-parameter-title" className="wt-parameter-dialog"><h2 id="wt-parameter-title">Select parameters</h2><label>Search parameters<input autoFocus value={parameterQuery} onChange={event => setParameterQuery(event.target.value)} /></label><div className="wt-toolbar"><button onClick={() => setDraftKeys(data.parameters.map(p => p.key))}>All parameters</button><button onClick={() => setDraftKeys([])}>No parameters</button></div><div className="wt-parameter-options">{data.parameters.filter(p => p.label.toLocaleLowerCase().includes(parameterQuery.toLocaleLowerCase())).map(p => <label key={p.key}><input type="checkbox" checked={draftKeys.includes(p.key)} onChange={event => setDraftKeys(previous => event.target.checked ? [...previous!, p.key] : previous!.filter(key => key !== p.key))} />{p.label}</label>)}</div><div className="wt-toolbar"><button onClick={() => { setParameterKeys(draftKeys); closePicker() }}>Apply</button><button onClick={closePicker}>Cancel</button></div></dialog>}
  </div>
}
