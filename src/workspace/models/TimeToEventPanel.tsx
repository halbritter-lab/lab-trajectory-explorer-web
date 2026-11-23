import { useId, useMemo, useRef, useState } from 'react'
import type { WorkspaceData } from '../workspace-data'
import { workspaceModelSpec } from '../workspace-data'
import { useAppStore } from '../state/store'
import { buildCohortRows } from '../../core/cohort/screening'
import { isEgfrUnit } from '../../core/domains/nephrology/analytes'
import { groupColors } from '../../core/grouping/grouping'
import { DAYS_PER_YEAR, TIME_TO_EVENT_ENDPOINTS, timeToEventAnalysis, type TimeToEventEndpoint, type TimeToEventScale } from '../../core/domains/nephrology/endpoints/timeToEvent'
import { stepValueAt, type LogRankResult, type QuantileEstimate } from '../../core/survival/survival'
import { availableTimeToEventEndpoints, endpointDefinitionText, numberAtRiskAt, TIME_SCALE_LABELS, timeToEventExportSheets, timeToEventInputs } from '../time-to-event'
import { workspaceGroupableAttributes } from '../workspace-model-results'
import { ChartExportActions } from '../WorkspaceExports'
import { labRowsInputDataId } from '../workspace-export'
import { downloadBlob, fileStamp, sheetsToXlsxBytes } from '../../io/export'
import { version as APP_VERSION } from '../../../package.json'
import { inEnglish, t, tp, tx, useLanguage } from '../../i18n'

// Literal colours: exported SVGs carry no CSS variables.
const COHORT_COLOR = '#243740'
const GRID_COLOR = '#dce5e9'
const FRAME_COLOR = '#cbd8d6'

const formatYears = (days: number | null, digits = 1) => days === null ? t('not reached') : (days / DAYS_PER_YEAR).toFixed(digits)
/** The median and its interval. A limit is "not reached" when its curve stays
 * above 0.5, "not estimable" when the curve falls to 0 and the log-log
 * interval does not exist there (R NA). */
function medianText(median: QuantileEstimate): string {
  const low = median.lower !== null ? formatYears(median.lower) : median.lowerNotEstimable ? t('lower bound not estimable') : t('not reached')
  const high = median.upper !== null ? formatYears(median.upper) : median.upperNotEstimable ? t('upper bound not estimable') : t('not reached')
  return `${formatYears(median.estimate)} (${t('{low} to {high}', { low, high })})`
}
/** Which groups the log-rank test compares; groups with variance 0 are left out (and named). */
function logRankGroupsText(groups: LogRankResult['groups']): string {
  const compared = groups.filter(group => group.compared).length
  const leftOut = groups.filter(group => !group.compared)
  const all = tp('{n} group', '{n} groups', groups.length)
  if (leftOut.length === 0) return all
  return t('{all}, {compared} compared ({leftOut} without patients at risk at any endpoint time beside patients of other groups left out: {names})', {
    all, compared, leftOut: leftOut.length, names: leftOut.map(group => groupText(group.label)).join(', '),
  })
}
/** The cohort group keeps its English key; only its label is translated. */
/** The endpoint as named in the interface (`endpointLabel` of the core, translated). */
const endpointText = (endpoint: TimeToEventEndpoint, composite: boolean) => {
  const base = tx(TIME_TO_EVENT_ENDPOINTS.find(item => item.id === endpoint)?.label ?? endpoint)
  return endpoint !== 'kidneyFailure' && composite ? t('{endpoint} or kidney replacement therapy, whichever comes first', { endpoint: base }) : base
}
const groupText = (label: string) => label === 'All patients' ? t('All patients') : label
const formatP = (p: number | null) => p === null ? '—' : p < 0.001 ? '< 0.001' : p.toFixed(3)

/** A step of 1, 2, 5 or 10 × 10^k giving at most about eight ticks. */
function tickStep(span: number): number {
  if (!(span > 0)) return 1
  const raw = span / 8
  const power = 10 ** Math.floor(Math.log10(raw))
  for (const factor of [1, 2, 5, 10]) if (factor * power >= raw) return factor * power
  return 10 * power
}

type CurveMode = 'survival' | 'incidence'

/** The "Time to event" area of Cohort models (decision `taxonomy`, issue #78):
 * Kaplan–Meier per group, log-rank test, Aalen–Johansen with deaths. No R. */
export function TimeToEventPanel({ data, onBrowseTrajectories }: { data: WorkspaceData; onBrowseTrajectories: () => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const headingId = useId()
  // Renders again on a language switch, including the English render of a chart export.
  const language = useLanguage()
  const trajectoryFitSettings = useAppStore(s => s.trajectoryFitSettings)
  const parameters = useMemo(() => data.parameters.filter(parameter => isEgfrUnit(parameter.einheit)
    && data.rows.some(row => row.bezeichnung === parameter.bezeichnung && row.einheit === parameter.einheit && row.wertNum !== null)), [data.parameters, data.rows])
  // The choices of this area live in the store for the session, so the analysis record lists them.
  const choices = useAppStore(s => s.timeToEventSettings)
  const setChoices = useAppStore(s => s.setTimeToEventSettings)
  const { parameterKey: parameterChoice, endpoint: endpointChoice, compositeWithKrt, timeScale, grouping } = choices
  const parameterKey = parameterChoice !== null && parameters.some(p => p.key === parameterChoice) ? parameterChoice : parameters[0]?.key
  const parameter = parameters.find(p => p.key === parameterKey)
  const spec = useMemo(() => parameterKey ? workspaceModelSpec(data, parameterKey, trajectoryFitSettings) : undefined, [data, parameterKey, trajectoryFitSettings])
  const endpointSettings = spec?.fitConfig?.endpoints
  const available = availableTimeToEventEndpoints(endpointSettings)
  const endpoint = endpointChoice !== null && available.includes(endpointChoice) ? endpointChoice : available.find(id => id !== 'kidneyFailure') ?? 'kidneyFailure'
  const [curveMode, setCurveMode] = useState<CurveMode>('survival')
  const [exportError, setExportError] = useState<string | null>(null)

  const patientIds = useMemo(() => data.patients.map(patient => patient.id), [data.patients])
  const groupableAttributes = useMemo(() => workspaceGroupableAttributes(data.rows, data.patientAttributes ?? {}), [data.rows, data.patientAttributes])
  const groupingOptions = useMemo(() => [...new Set(Object.values(groupableAttributes).flatMap(attributes => Object.keys(attributes)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })), [groupableAttributes])
  const activeGrouping = grouping !== null && groupingOptions.includes(grouping) ? grouping : null
  // The cells of the Trajectories table for this parameter, under its settings.
  const cells = useMemo(() => spec ? buildCohortRows(data.rows, patientIds, [spec]).map(row => ({ patientId: row.patientId, cell: row.cells[0] })) : [], [data.rows, patientIds, spec])
  const settings = { endpoint, compositeWithKrt: endpoint !== 'kidneyFailure' && compositeWithKrt, timeScale, grouping: activeGrouping }
  const analysis = useMemo(() => timeToEventAnalysis(timeToEventInputs(cells, settings.endpoint, settings.grouping, groupableAttributes, data.events, data.patients), settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells, settings.endpoint, settings.compositeWithKrt, settings.timeScale, settings.grouping, groupableAttributes, data.events, data.patients])
  const definition = parameter ? endpointDefinitionText(endpoint, settings.compositeWithKrt, endpointSettings, parameter.bezeichnung) : ''
  const notInAnalysis = analysis.rows.filter(row => !row.included)
  const colors = useMemo(() => {
    const map = groupColors(analysis.groups.map(group => ({ value: group.label, patientIds: [] })))
    if (activeGrouping === null) map.set('All patients', COHORT_COLOR)
    return map
  }, [analysis.groups, activeGrouping])
  const mode: CurveMode = analysis.deathRecorded ? curveMode : 'survival'

  if (!parameter || !spec) {
    return <section className="card cm-tte" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('Time to event')}</h2>
      <p className="muted">{t('The time-to-event analysis needs an eGFR parameter (unit mL/min/1.73 m²). Import one or compute eGFR under Data.')}</p>
    </section>
  }

  // Chart geometry, in years.
  const included = analysis.rows.filter(row => row.included)
  const minEntry = timeScale === 'age' ? Math.min(...included.map(row => row.entryDays!)) : 0
  const maxExit = Math.max(0, ...included.map(row => row.exitDays!))
  const step = tickStep((maxExit - minEntry) / DAYS_PER_YEAR)
  const xMin = included.length ? Math.floor(minEntry / DAYS_PER_YEAR / step) * step : 0
  const xMax = included.length ? Math.max(xMin + step, Math.ceil(maxExit / DAYS_PER_YEAR / step) * step) : 1
  const ticks: number[] = []
  for (let tick = xMin; tick <= xMax + 1e-9; tick += step) ticks.push(Math.round(tick * 1e6) / 1e6)
  // Room for the larger axis text on phones (cohort-models-workspace.css, 600px query).
  const W = 720, H = 300, padLeft = 76, padRight = 20, padTop = 20, padBottom = 48
  const xRange = W - padLeft - padRight
  const yRange = H - padTop - padBottom
  const scaleX = (years: number) => padLeft + ((years - xMin) / (xMax - xMin || 1)) * xRange
  const scaleY = (p: number) => padTop + yRange - p * yRange
  // In the interface language on the page; the chart export renders the page
  // in English (renderedInEnglish), so the exported figure keeps English axes.
  const yLabel = mode === 'survival' ? t('Event-free probability') : t('Cumulative incidence')
  const xLabel = timeScale === 'age' ? t('Age (years)') : t('Years since the first eligible measurement')
  // German nouns keep their capital letter inside the sentence.
  const chartLabel = t('{measure} by {time}', { measure: yLabel, time: language === 'en' ? xLabel.toLowerCase() : xLabel })

  const curves = analysis.groups.flatMap(group => {
    if (group.subjects.length === 0) return []
    const color = colors.get(group.label) ?? COHORT_COLOR
    const start = (timeScale === 'age' ? Math.min(...group.subjects.map(s => s.entry)) : 0) / DAYS_PER_YEAR
    const end = Math.max(...group.subjects.map(s => s.exit)) / DAYS_PER_YEAR
    const path = (points: { time: number; value: number }[], initial: number) => {
      let d = `M${scaleX(start)},${scaleY(initial)}`
      let current = initial
      for (const point of points) {
        const x = scaleX(point.time / DAYS_PER_YEAR)
        d += ` H${x}`
        if (point.value !== current) { d += ` V${scaleY(point.value)}`; current = point.value }
      }
      return `${d} H${scaleX(end)}`
    }
    const km = group.km.steps.map(s => ({ time: s.time, value: mode === 'survival' ? s.survival : 1 - s.survival }))
    const censors = group.km.steps.filter(s => s.nCensor > 0).map(s => ({ x: scaleX(s.time / DAYS_PER_YEAR), y: scaleY(mode === 'survival' ? s.survival : 1 - s.survival) }))
    const aj = mode === 'incidence' && group.cumulativeIncidence ? path(group.cumulativeIncidence.map(s => ({ time: s.time, value: s.endpoint })), 0) : null
    return [{ label: group.label, color, km: path(km, mode === 'survival' ? 1 : 0), censors, aj }]
  })
  const legend = curves.flatMap(curve => mode === 'incidence'
    ? [{ label: `${groupText(curve.label)}: 1 − KM`, color: curve.color }, { label: `${groupText(curve.label)}: Aalen–Johansen`, color: curve.color }]
    : [{ label: groupText(curve.label), color: curve.color }])
  const chartTitle = t('Time to event: {endpoint}, {parameter}', { endpoint: endpointText(endpoint, settings.compositeWithKrt), parameter: parameter.label })

  function exportWorkbook() {
    setExportError(null)
    try {
      const fileName = `lab-trajectory-time-to-event-${fileStamp()}.xlsx`
      const sheets = timeToEventExportSheets(analysis, {
        parameterKey: parameter!.key, parameterName: parameter!.bezeichnung, parameterUnit: parameter!.einheit,
        // The export is English whatever the interface shows (issue #71).
        parameterLabel: inEnglish(() => parameter!.label), definition: inEnglish(() => endpointDefinitionText(endpoint, settings.compositeWithKrt, endpointSettings, parameter!.bezeichnung)), fitConfig: spec!.fitConfig, analysisSettings: data.analysisSettings, inputDataId: labRowsInputDataId(data.rawRows),
        workbookName: fileName, appVersion: APP_VERSION,
      })
      downloadBlob(sheetsToXlsxBytes(sheets), fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch (error) {
      setExportError(t('Export failed: {error}', { error: error instanceof Error ? error.message : String(error) }))
    }
  }

  return <section className="card cm-tte stack" aria-labelledby={headingId} id="cohort-model-time-to-event">
    <div>
      <h2 id={headingId}>{t('Time to event')}</h2>
      <p className="muted">{t('Kaplan–Meier estimate of the time to a confirmed eGFR endpoint per group, with the log-rank test between groups. A description of the cohort for research use, not a prognosis. No R is needed.')} <a href="https://github.com/halbritter-lab/lab-trajectory-explorer-web/blob/main/docs/method-algorithms/time-to-event.md" target="_blank" rel="noopener noreferrer">{t('Time to event: method reference (opens in a new tab)')}</a></p>
    </div>
    <div className="cm-primary-controls cm-tte-controls">
      <label>{t('Parameter')}
        <select aria-label={t('Time-to-event parameter')} value={parameter.key} onChange={e => setChoices({ parameterKey: e.target.value })}>
          {parameters.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
      <label>{t('Endpoint')}
        <select aria-label={t('Time-to-event endpoint')} value={endpoint} onChange={e => setChoices({ endpoint: e.target.value as TimeToEventEndpoint })}>
          {TIME_TO_EVENT_ENDPOINTS.filter(item => available.includes(item.id)).map(item => <option key={item.id} value={item.id}>{tx(item.label)}</option>)}
        </select>
      </label>
      <label className="mixed-model-config-check">
        <input type="checkbox" checked={settings.compositeWithKrt} disabled={endpoint === 'kidneyFailure'} onChange={e => setChoices({ compositeWithKrt: e.target.checked })} />
        {t('Or kidney replacement therapy, whichever comes first')}
      </label>
      <label>{t('Time scale')}
        <select aria-label={t('Time scale')} value={timeScale} onChange={e => setChoices({ timeScale: e.target.value as TimeToEventScale })}>
          <option value="age">{tx(TIME_SCALE_LABELS.age)}</option>
          <option value="time_since_entry">{tx(TIME_SCALE_LABELS.time_since_entry)}</option>
        </select>
      </label>
      <label>{t('Grouping')}
        <select aria-label={t('Time-to-event grouping')} value={activeGrouping ?? ''} onChange={e => setChoices({ grouping: e.target.value || null })}>
          <option value="">{t('No grouping (whole cohort)')}</option>
          {groupingOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    </div>
    <div className="cm-tte-definition" aria-label={t('Endpoint definition')}>
      <p><strong>{t('Endpoint definition')}</strong> {t('(from the endpoint settings of {label} under Trajectories, read-only here): {definition}.', { label: parameter.label, definition })}</p>
      {available.length === 1 && <p className="muted">{t('Only kidney replacement therapy is available: switch on observed CKD G4, G5 or percent eGFR decline in the endpoint settings of this parameter to analyse them.')}</p>}
      <button type="button" onClick={onBrowseTrajectories}>{t('Change endpoint settings under Trajectories →')}</button>
    </div>

    <div className="cm-tte-table-wrap">
      <table className="cm-tte-table cm-tte-groups" aria-label={t('Time to event by group')}>
        <thead><tr><th scope="col">{t('Group')}</th><th scope="col">{t('Patients')}</th><th scope="col">{t('Events')}</th><th scope="col">{t('Censored')}</th><th scope="col">{t('Of which died')}</th><th scope="col">{t('Median event-free time, years (95% CI)')}</th></tr></thead>
        <tbody>{analysis.groups.map(group => <tr key={group.label}>
          <td>{groupText(group.label)}</td><td>{group.km.subjects}</td><td>{group.km.events}</td><td>{group.km.censored}</td><td>{group.km.deaths}</td>
          <td>{group.km.subjects === 0 ? '—' : medianText(group.km.median)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="muted">{timeScale === 'age' ? t('Median: the age at which the event-free probability reaches 0.5.') : t('Median: the years from the first eligible measurement until the event-free probability reaches 0.5.')} {t('Interval by Brookmeyer–Crowley on the log-log interval of the curve. Death before the endpoint is censored in the Kaplan–Meier estimate.')}</p>
    {analysis.logRank && <p aria-label={t('Log-rank test')}>{t('Log-rank test between {groups}: {value}. Observed / expected: {value2}. Unadjusted.', { groups: logRankGroupsText(analysis.logRank.groups), value: analysis.logRank.chiSquare === null ? t('not computed (fewer than two groups with expected events)') : `χ² = ${analysis.logRank.chiSquare.toFixed(2)}, ${analysis.logRank.df} df, p = ${formatP(analysis.logRank.pValue)}`, value2: analysis.logRank.groups.map(group => `${groupText(group.label)} ${group.observed} / ${group.expected.toFixed(1)}`).join('; ') })}</p>}
    {timeScale === 'age' && included.some(row => row.ageEstimated) && <p className="notice" role="note">{t('Ages of {length} patients rest on ages in completed years or a manual age; their entry and exit can be up to a year off.', { length: included.filter(row => row.ageEstimated).length })}</p>}

    {analysis.deathRecorded && <div role="radiogroup" aria-label={t('Curve')} className="cm-tte-curve">
      <label><input type="radio" name={`${headingId}-curve`} checked={mode === 'survival'} onChange={() => setCurveMode('survival')} />{t('Event-free probability (Kaplan–Meier)')}</label>
      <label><input type="radio" name={`${headingId}-curve`} checked={mode === 'incidence'} onChange={() => setCurveMode('incidence')} />{t('Cumulative incidence: 1 − KM and Aalen–Johansen (death as competing event)')}</label>
    </div>}
    {analysis.deathRecorded && <p className="muted">{t('With recorded deaths, 1 − KM overstates the risk of the endpoint, because it treats patients who died as if they could still reach it; the Aalen–Johansen estimate counts death as a competing event (Noordzij et al., NDT 2013).')}</p>}

    <div className="cm-plot-actions">
      <ChartExportActions getSvg={() => svg.current} title={chartTitle} />
      <button type="button" disabled={analysis.rows.length === 0} onClick={exportWorkbook}>{t('Export time to event (XLSX)')}</button>
      {exportError && <p role="alert">{exportError}</p>}
    </div>
    <div className="cm-plot-svg-wrap">
      <svg ref={svg} className="cm-plot-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chartLabel}
        data-export-context={`${definition}. ${tx(TIME_SCALE_LABELS[timeScale])}. ${t('Research use only.')}`}
        data-export-legend={JSON.stringify(legend)}>
        <title>{chartTitle}</title>
        {[0, 0.25, 0.5, 0.75, 1].map(p => <g key={p}>
          <line x1={padLeft} x2={W - padRight} y1={scaleY(p)} y2={scaleY(p)} stroke={GRID_COLOR} strokeDasharray="2 3" />
          <text x={padLeft - 8} y={scaleY(p) + 4} textAnchor="end" className="cm-axis-text">{p.toFixed(2)}</text>
        </g>)}
        {ticks.map(tick => <g key={tick}>
          <line x1={scaleX(tick)} x2={scaleX(tick)} y1={padTop} y2={H - padBottom} stroke={GRID_COLOR} strokeDasharray="2 3" />
          <text x={scaleX(tick)} y={H - padBottom + 20} textAnchor="middle" className="cm-axis-text">{tick}</text>
        </g>)}
        <text x={padLeft + xRange / 2} y={H - 6} textAnchor="middle" className="cm-axis-text">{xLabel}</text>
        <text x={18} y={padTop + yRange / 2} textAnchor="middle" className="cm-axis-text" transform={`rotate(-90 18 ${padTop + yRange / 2})`}>{yLabel}</text>
        <rect x={padLeft} y={padTop} width={xRange} height={yRange} fill="none" stroke={FRAME_COLOR} />
        {curves.map(curve => <g key={curve.label}>
          <path d={curve.km} fill="none" stroke={curve.color} strokeWidth="2"><title>{`${groupText(curve.label)}: ${mode === 'survival' ? 'Kaplan–Meier' : '1 − Kaplan–Meier'}`}</title></path>
          {curve.aj && <path d={curve.aj} fill="none" stroke={curve.color} strokeWidth="2" strokeDasharray="6 3"><title>{`${groupText(curve.label)}: Aalen–Johansen`}</title></path>}
          {curve.censors.map((c, i) => <line key={i} x1={c.x} x2={c.x} y1={c.y - 4} y2={c.y + 4} stroke={curve.color} strokeWidth="1.2" />)}
        </g>)}
      </svg>
    </div>
    <p className="muted">{t('Ticks mark censored patients (and, in the Kaplan–Meier curve, deaths).')}{mode === 'incidence' ? ` ${t('Solid: 1 − KM; dashed: Aalen–Johansen.')}` : ''} {t('Legend: {legend}.', { legend: legend.map(item => item.label).join(', ') })}</p>
    <div className="cm-tte-table-wrap">
      <table className="cm-tte-table" aria-label={t('Number at risk')}>
        <caption className="muted">{t('Number at risk')}</caption>
        <thead><tr><th scope="col">{t('Group')}</th>{ticks.map(tick => <th scope="col" key={tick}>{tick}</th>)}</tr></thead>
        <tbody>{analysis.groups.map(group => <tr key={group.label}><td>{groupText(group.label)}</td>{ticks.map(tick => <td key={tick}>{numberAtRiskAt(group.subjects, tick, timeScale)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {mode === 'incidence' && <div className="cm-tte-table-wrap">
      <table className="cm-tte-table" aria-label={t('Cumulative incidence at the ticks')}>
        <caption className="muted">{t('Cumulative incidence of the endpoint: 1 − KM / Aalen–Johansen')}</caption>
        <thead><tr><th scope="col">{t('Group')}</th>{ticks.map(tick => <th scope="col" key={tick}>{tick}</th>)}</tr></thead>
        <tbody>{analysis.groups.map(group => <tr key={group.label}><td>{groupText(group.label)}</td>{ticks.map(tick => {
          const days = tick * DAYS_PER_YEAR
          const km = 1 - stepValueAt(group.km.steps, s => s.survival, days)
          const aj = stepValueAt(group.cumulativeIncidence ?? [], s => s.endpoint, days, 0)
          return <td key={tick}>{km.toFixed(2)} / {aj.toFixed(2)}</td>
        })}</tr>)}</tbody>
      </table>
    </div>}

    {notInAnalysis.length > 0 && <details className="cm-excluded-patients">
      <summary>{t('Patients not in the analysis ({notInAnalysis})', { notInAnalysis: notInAnalysis.length })}</summary>
      <ul aria-label={t('Patients not in the analysis')}>{notInAnalysis.map(row => <li key={row.patientId}>{row.patientId}: {row.reason}</li>)}</ul>
    </details>}
  </section>
}
