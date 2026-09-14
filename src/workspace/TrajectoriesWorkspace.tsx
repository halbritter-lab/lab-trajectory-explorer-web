import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildCohortRows, type CohortCell } from '../core/cohort/screening'
import { comparePatientIds, type LabRow, type PatientId } from '../core/types'
import { slopeQualityLabel } from '../ui/qualityLabels'
import { workspaceSpecs, type WorkspaceData } from './workspace-data'
import { WorkspaceExportActions } from './WorkspaceExports'
import { WorkspacePlot, boundedPrefix, measurementText, formatWorkspaceDate, formatWorkspaceNumber, type WorkspaceAxis } from './WorkspacePlot'
import './trajectories-workspace.css'
import { WorkspaceSparkline, type SparkDomain } from './WorkspaceSparkline'

function CellSummary({ cell, fit, measurements }: { cell: CohortCell; fit: boolean; measurements: LabRow[] }) {
  const last = cell.points[cell.points.length - 1]
  const lastSource = measurements.filter(row => row.labDatum && row.wertNum !== null).at(-1)
  const quality = slopeQualityLabel(cell)
  const qualityText = quality?.label === 'no values' ? 'Keine numerischen Werte' : quality?.label === 'no fit values' ? 'Keine Fit-Werte' : quality?.label === '< 1 yr' ? 'Zeitraum < 1 Jahr' : quality?.label
  return <div className="wt-cell-summary">
    <strong>{last ? `${boundedPrefix(lastSource?.wertOperator)}${formatWorkspaceNumber(last.value)}` : 'Keine Werte'}</strong>
    <span>{last ? `${formatWorkspaceDate(last.date)} · ${cell.nNumeric} Messwerte` : 'Keine numerischen Werte mit Datum'}</span>
    {fit && <><span>{Number.isFinite(cell.slope) ? `OLS: ${formatWorkspaceNumber(cell.slope)} ${cell.einheit ?? ''}/Jahr · R² ${formatWorkspaceNumber(cell.r2)}` : 'Kein Fit verfügbar'}</span><span>{cell.nFitted} Fit-Werte · {cell.fittedSpanDays} Tage</span>{quality && <span className={quality.caveat ? 'wt-warning' : 'wt-muted'}>{qualityText}{quality.caveat ? ' · unsichere Steigung' : ''}</span>}</>}
    {cell.akiChip && <span title={cell.akiSummary}>{cell.akiChip}</span>}
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
  const [axis, setAxis] = useState<WorkspaceAxis>('baseline')
  const [highlight, setHighlight] = useState<PatientId | null>(null)
  const [display, setDisplay] = useState({ points: true, connect: true, events: false })
  const [fitKeys, setFitKeys] = useState<string[]>([])
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
      setParameterNotice(`Die ausgewählte eGFR-Ableitung wurde auf ${nextDerived[0].label} aktualisiert.`)
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
  const specs = useMemo(() => workspaceSpecs(data, keys), [data, keys])
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
    if (min === max) { min -= .5; max += .5 }
    return { min, max, days }
  }), [cohort, specs])
  const attributes = [...new Set(data.patients.flatMap(p => Object.keys(p.attributes)))].sort()
  const groupValue = (id: PatientId) => data.patientAttributes[String(id)]?.[groupBy] || 'Ohne Angabe'
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
  const patientIds = visible.map(row => row.patientId)
  const current = visible.find(row => row.patientId === patientId) ?? visible[0]
  const currentIndex = visible.findIndex(row => row.patientId === current?.patientId)
  const open = (id: PatientId) => {
    if (mode === 'table') {
      tablePosition.current = { left: tableScroller.current?.scrollLeft ?? 0, top: document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop, restore: true }
      originatingPerson.current = id
    }
    setPatientId(id); setMode('detail')
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
  const moveColumns = (direction: number) => { if (tableScroller.current) { tableScroller.current.scrollLeft += direction * 450; tablePosition.current.left = tableScroller.current.scrollLeft } }
  const jumpParameter = (key: string) => {
    const header = parameterHeaders.current.get(key), scroller = tableScroller.current
    if (!header || !scroller) return
    const stickyWidth = Array.from(scroller.querySelectorAll('thead th')).slice(0, 2).reduce((sum, element) => sum + element.getBoundingClientRect().width, 0)
    scroller.scrollLeft += header.getBoundingClientRect().left - scroller.getBoundingClientRect().left - stickyWidth
    tablePosition.current.left = scroller.scrollLeft
  }
  useEffect(() => {
    if (requestedPatientId === undefined || requestedPatientId === null) return
    setQuery(''); setGroup(''); setSelectedOnly(false); setPatientId(requestedPatientId); setMode('detail')
  }, [requestedPatientId])
  useEffect(() => {
    if (draftKeys !== null && dialog.current && !dialog.current.open && typeof dialog.current.showModal === 'function') dialog.current.showModal()
  }, [draftKeys])
  const closePicker = () => { dialog.current?.close?.(); setDraftKeys(null); pickerButton.current?.focus() }
  const toggleFit = (key: string) => setFitKeys(previous => previous.includes(key) ? previous.filter(k => k !== key) : [...previous, key])
  if (!data.patients.length) return <section className="card"><h1>Patienten und Verläufe</h1><p>Noch keine Daten geladen. Unter „Daten“ eine CSV- oder Excel-Datei importieren oder Demodaten laden.</p></section>
  return <div className="wt-workspace">
    <header className="page-heading"><p className="eyebrow">PATIENTEN & VERLÄUFE</p><h1>Verläufe untersuchen</h1><p>{data.patients.length} Personen · {data.parameters.length} Parameter · {data.fileName ?? 'Geladene Daten'}</p></header>
    {parameterNotice && <p className="notice" role="status">{parameterNotice}</p>}
    {unavailable.length > 0 && <p className="notice" role="status">Nicht verfügbare ausgewählte Parameter: {unavailable.join(', ')}. Die Ableitung ist deaktiviert oder liefert derzeit keine berechenbaren Werte. Die Auswahl bleibt für eine erneute Berechnung erhalten; nicht verfügbare Parameter sind nicht im Export enthalten.</p>}
    <section className="card wt-controls" aria-label="Gemeinsame Auswahl">
      <div className="wt-toolbar"><button ref={pickerButton} onClick={() => { setParameterQuery(''); setDraftKeys([...keys]) }}>Parameter wählen</button><span>{parameters.length} Parameter ausgewählt</span><WorkspaceExportActions data={data} parameterKeys={keys} patientIds={patientIds} cohortRows={visible} {...(mode === 'detail' && current ? { patientId: current.patientId } : {})} /></div>
      <div className="wt-control-grid">
        <label>Person suchen<input value={query} onChange={event => setQuery(event.target.value)} placeholder="ID oder Name" /></label>
        <label>Gruppieren nach<select value={groupBy} onChange={event => { setGroupBy(event.target.value); setGroup('') }}><option value="">Keine Gruppierung</option>{attributes.map(attribute => <option key={attribute}>{attribute}</option>)}</select></label>
        <label>Gruppe filtern<select value={group} disabled={!groupBy} onChange={event => setGroup(event.target.value)}><option value="">Alle Gruppen</option>{groupBy && groups.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Sortieren<select value={keys.includes(sort) ? sort : 'id'} onChange={event => setSort(event.target.value)}><option value="id">Personen-ID</option>{parameters.map(p => <option key={p.key} value={p.key}>Letzter Wert: {p.label} ↓</option>)}</select></label>
      </div>
      <div className="wt-toolbar"><label><input type="checkbox" checked={selectedOnly} onChange={event => setSelectedOnly(event.target.checked)} /> Nur ausgewählte Personen</label><span>{selected.length} ausgewählt · {visible.length} im gemeinsamen Umfang</span><button onClick={() => setSelected(previous => [...new Set([...previous, ...patientIds])])} disabled={!patientIds.length}>Sichtbare auswählen</button><button onClick={() => setSelected([])} disabled={!selected.length}>Auswahl leeren</button></div>
    </section>
    <div className="wt-toolbar" aria-label="Ansicht"><button aria-pressed={mode === 'table'} onClick={() => setMode('table')}>Tabelle</button><button aria-pressed={mode === 'overlay'} onClick={() => setMode('overlay')}>Overlay</button><button aria-pressed={mode === 'detail'} disabled={!current} onClick={() => setMode('detail')}>Einzelperson</button></div>
    <details className="card"><summary>Anzeige und Auswertung</summary><p>Allgemeine Exploration: globale OLS je Person und Parameter, ungewichtete Einzelmessungen, keine AKI- oder Ereignisausschlüsse, keine Zeitaggregation. Steigungen pro Jahr. Die Achsenauswahl ändert die Darstellung, nicht die Berechnung.</p><div className="wt-toolbar">{parameters.map(p => <label key={p.key}><input type="checkbox" checked={fitKeys.includes(p.key)} onChange={() => toggleFit(p.key)} /> OLS, Steigung und R²: {p.label}</label>)}</div></details>
    {mode !== 'table' && <section className="card wt-control-grid" aria-label="Plot-Einstellungen"><label>Zeitachse<select value={axis} onChange={event => setAxis(event.target.value as WorkspaceAxis)}><option value="baseline">Jahre seit erster Messung</option><option value="calendar">Kalenderdatum</option><option value="age">Alter</option></select></label><label>Person hervorheben<select value={highlight === null ? '' : String(patientIds.indexOf(highlight))} onChange={event => setHighlight(event.target.value === '' ? null : patientIds[Number(event.target.value)] ?? null)}><option value="">Keine</option>{patientIds.map((id, i) => <option key={String(id)} value={i}>{id}</option>)}</select></label><div className="wt-toolbar">{(['points', 'connect', 'events'] as const).map(key => <label key={key}><input type="checkbox" checked={display[key]} onChange={event => setDisplay(previous => ({ ...previous, [key]: event.target.checked }))} />{key === 'points' ? 'Messpunkte' : key === 'connect' ? 'Verbindungslinien' : 'Ereignisse'}</label>)}</div></section>}
    {mode === 'table' && parameters.length > 0 && <div className="wt-toolbar"><button onClick={() => moveColumns(-1)}>Spalten nach links</button><label>Zu Parameter springen<select defaultValue="" onChange={event => jumpParameter(event.target.value)}><option value="" disabled>Parameter wählen …</option>{parameters.map(parameter => <option key={parameter.key} value={parameter.key}>{parameter.label}</option>)}</select></label><button onClick={() => moveColumns(1)}>Spalten nach rechts</button><span className="wt-muted">Gemeinsame Skala je Parameter; Zeit seit erster Messung. ID bleibt beim horizontalen Scrollen sichtbar.</span></div>}
    {!visible.length && <p className="card">Keine passenden Personen. Suche, Gruppenfilter oder Auswahl ändern.</p>}
    {!parameters.length && <p className="card">Mindestens einen Parameter auswählen.</p>}
    {mode === 'table' && visible.length > 0 && <div ref={tableScroller} onScroll={event => { tablePosition.current.left = event.currentTarget.scrollLeft }} className="wt-table-scroll" tabIndex={0} role="region" aria-label="Patiententabelle, horizontal scrollbar"><table className="wt-table"><thead><tr><th>Auswahl</th><th>Person</th>{parameters.map(p => <th key={p.key} ref={element => { if (element) parameterHeaders.current.set(p.key, element); else parameterHeaders.current.delete(p.key) }}>{p.label}{p.derived ? ' · abgeleitet' : ''}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={String(row.patientId)}><td><input type="checkbox" aria-label={`Person ${row.patientId} auswählen`} checked={selected.includes(row.patientId)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.patientId] : previous.filter(id => id !== row.patientId))} /></td><th scope="row"><button ref={element => { if (element) personButtons.current.set(row.patientId, element); else personButtons.current.delete(row.patientId) }} aria-label={`Person ${row.patientId} öffnen`} onClick={() => open(row.patientId)}>{row.patientId}</button>{groupBy && <small>{groupValue(row.patientId)}</small>}</th>{row.cells.map((cell, i) => <td key={keys[i]}><WorkspaceSparkline cell={cell} measurements={measurementsFor(row.patientId, cell)} patientId={row.patientId} label={parameters[i].label} domain={sparkDomains[i]} fit={fitKeys.includes(keys[i])} /><CellSummary cell={cell} fit={fitKeys.includes(keys[i])} measurements={measurementsFor(row.patientId, cell)} /></td>)}</tr>)}</tbody></table></div>}
    {mode === 'overlay' && <div className="wt-plot-grid">{parameters.map((parameter, index) => <WorkspacePlot key={`${parameter.key}-${groupBy}`} data={data} parameter={parameter} parameterIndex={index} cohortRows={visible} axis={axis} groupBy={groupBy} highlight={highlight} display={display} showFit={fitKeys.includes(parameter.key)} onOpen={open} />)}</div>}
    {mode === 'detail' && current && <section><div className="wt-toolbar"><h2 ref={detailHeading} tabIndex={-1}>Person {current.patientId}</h2><button disabled={currentIndex <= 0} onClick={() => setPatientId(visible[currentIndex - 1].patientId)}>Vorherige Person</button><label>Person direkt öffnen<select value={currentIndex} onChange={event => setPatientId(visible[Number(event.target.value)].patientId)}>{visible.map((row, index) => <option key={String(row.patientId)} value={index}>{row.patientId}</option>)}</select></label><button disabled={currentIndex >= visible.length - 1} onClick={() => setPatientId(visible[currentIndex + 1].patientId)}>Nächste Person</button><span>{currentIndex + 1} / {visible.length}</span></div><div className="wt-plot-grid">{parameters.map((parameter, index) => {
      const measurements = measurementsFor(current.patientId, parameter)
      return <div key={parameter.key}><WorkspacePlot data={data} parameter={parameter} parameterIndex={index} cohortRows={[current]} axis={axis} groupBy="" highlight={null} display={display} showFit={fitKeys.includes(parameter.key)} onOpen={open} /><div className="card"><CellSummary cell={current.cells[index]} fit={fitKeys.includes(parameter.key)} measurements={measurements} /><details open={!current.cells[index].points.length || axis === 'age' && data.patients.find(p => p.id === current.patientId)?.baselineAge === null}><summary>Messwerte anzeigen ({measurements.length})</summary><div className="wt-table-scroll"><table aria-label={`Messwerte ${parameter.label}`}><thead><tr><th>Datum</th><th>{parameter.derived ? 'Berechneter Wert' : 'Originalwert'}</th><th>Numerischer Wert</th><th>Alter</th></tr></thead><tbody>{measurements.map((row, i) => <tr key={i}><td>{row.labDatum ? formatWorkspaceDate(row.labDatum) : 'Datum fehlt'}</td><td>{measurementText(row)}</td><td>{row.wertNum === null ? 'Nicht numerisch / fehlt' : `${boundedPrefix(row.wertOperator)}${formatWorkspaceNumber(row.wertNum)}`}</td><td>{row.patientAgeAtLab === null ? 'Fehlt' : formatWorkspaceNumber(row.patientAgeAtLab)}</td></tr>)}</tbody></table></div>{!measurements.length && <p>Keine Messungen für diesen Parameter vorhanden.</p>}</details></div></div>
    })}</div><section className="card"><h3>Ereignisse dieser Person</h3>{data.events.some(e => e.patientId === current.patientId) ? <ul>{data.events.filter(e => e.patientId === current.patientId).map((event, i) => <li key={i}>{formatWorkspaceDate(event.date)}: {event.title}{event.endDate ? ` bis ${formatWorkspaceDate(event.endDate)}` : ''}{event.description ? ` · ${event.description}` : ''}</li>)}</ul> : <p>Keine Ereignisse hinterlegt.</p>}</section></section>}
    {draftKeys !== null && <dialog ref={dialog} open={typeof HTMLDialogElement.prototype.showModal !== 'function' ? true : undefined} onCancel={event => { event.preventDefault(); closePicker() }} aria-labelledby="wt-parameter-title" className="wt-parameter-dialog"><h2 id="wt-parameter-title">Parameter auswählen</h2><label>Parameter suchen<input autoFocus value={parameterQuery} onChange={event => setParameterQuery(event.target.value)} /></label><div className="wt-toolbar"><button onClick={() => setDraftKeys(data.parameters.map(p => p.key))}>Alle Parameter</button><button onClick={() => setDraftKeys([])}>Keine Parameter</button></div><div className="wt-parameter-options">{data.parameters.filter(p => p.label.toLocaleLowerCase().includes(parameterQuery.toLocaleLowerCase())).map(p => <label key={p.key}><input type="checkbox" checked={draftKeys.includes(p.key)} onChange={event => setDraftKeys(previous => event.target.checked ? [...previous!, p.key] : previous!.filter(key => key !== p.key))} />{p.label}</label>)}</div><div className="wt-toolbar"><button onClick={() => { setParameterKeys(draftKeys); closePicker() }}>Übernehmen</button><button onClick={closePicker}>Abbrechen</button></div></dialog>}
  </div>
}
