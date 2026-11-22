import { useMemo, useState } from 'react'
import { seriesRefKey, type MergeSeriesRef } from '../core/analysis/seriesMerge'
import { mergeUnitConversion } from '../core/domains/nephrology/seriesMergeModule'
import { fitGlobal } from '../core/stats/series'
import { isExactMeasurement } from '../core/measurements/censored'
import { formatDisplayDate, formatDisplayNumber, formatFixedDecimals } from '../core/format'
import type { LabRow, PatientId } from '../core/types'
import { calendarTicks, niceTicks, tickLabels } from './plot-ticks'
import { markPath, markShape, MARK_SYMBOLS } from './WorkspacePlot'
import { countLabel, parameterLabel } from './workspace-labels'

const PLOT = { left: 65, right: 630, top: 20, bottom: 240 }
const COLORS = ['#176c68', '#a15a2c', '#487ca9', '#8560a4', '#8c7427', '#b14c73', '#3d797f']
const YEAR_MS = 365.25 * 86_400_000

export interface ComparisonPoint { date: Date; value: number; original: number; operator: LabRow['wertOperator']; source: string | null; labMethod: string | null }
export interface ComparisonSeries {
  ref: MergeSeriesRef
  factor: number
  points: ComparisonPoint[]
  /** OLS over the exact values in the display unit; null below two distinct dates. */
  fit: { slope: number; intercept: number; ciLow: number; ciHigh: number; origin: number } | null
  labMethods: string[]
}

/** The series of one patient in a common display unit (issue #68): every
 * dated numeric value of each chosen series, converted by the merge rule
 * (same unit, or serum creatinine between mg/dl and µmol/l), and one OLS line
 * per series over its exact values, on years since the series' first exact
 * value. Display only: no time balancing, censoring or exclusions. A series
 * that does not convert to `displayUnit` is left out. */
export function comparisonSeries(rows: readonly LabRow[], patientId: PatientId, refs: readonly MergeSeriesRef[], displayUnit: string): ComparisonSeries[] {
  return refs.flatMap(ref => {
    const factor = mergeUnitConversion(ref, displayUnit)
    if (factor === null) return []
    const own = rows.filter(r => r.patientId === patientId && r.bezeichnung === ref.bezeichnung && (r.einheit ?? null) === (ref.einheit ?? null) && r.labDatum !== null && r.wertNum !== null)
      .sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    const points = own.map(r => ({ date: r.labDatum!, value: r.wertNum! * factor, original: r.wertNum!, operator: r.wertOperator,
      source: r.mergedFrom ? parameterLabel(r.mergedFrom.bezeichnung, r.mergedFrom.einheit) : null, labMethod: r.labMethod ?? null }))
    const exact = own.filter(isExactMeasurement).map(r => ({ date: r.labDatum!, value: r.wertNum! * factor }))
    const dates = new Set(exact.map(p => p.date.getTime()))
    const fitted = dates.size >= 2 ? fitGlobal(exact) : null
    const fit = fitted && Number.isFinite(fitted.slope) ? { slope: fitted.slope, intercept: fitted.intercept, ciLow: fitted.ciLow, ciHigh: fitted.ciHigh, origin: Math.min(...dates) } : null
    return [{ ref, factor, points, fit, labMethods: [...new Set(own.flatMap(r => r.labMethod ? [r.labMethod] : []))] }]
  })
}

/**
 * "Compare series" in the patient view (issue #68, owner decision of
 * 2026-11-21): several series of the patient in one chart, each with its own
 * colour, marker shape and comparison line, so that differences between
 * laboratories or methods are visible before anyone merges them. The first
 * chosen series sets the display unit; series in another unit can be added
 * only where the unit converts (serum creatinine mg/dl and µmol/l).
 */
export function SeriesComparison({ rows, patientId }: { rows: readonly LabRow[]; patientId: PatientId }) {
  const available = useMemo(() => {
    const byKey = new Map<string, { ref: MergeSeriesRef; values: number }>()
    for (const r of rows) {
      if (r.patientId !== patientId || r.bezeichnung === null || r.labDatum === null || r.wertNum === null) continue
      const ref = { bezeichnung: r.bezeichnung, einheit: r.einheit }
      const key = seriesRefKey(ref)
      const entry = byKey.get(key)
      if (entry) entry.values++
      else byKey.set(key, { ref, values: 1 })
    }
    return [...byKey.values()].sort((a, b) => a.ref.bezeichnung.localeCompare(b.ref.bezeichnung) || (a.ref.einheit ?? '').localeCompare(b.ref.einheit ?? ''))
  }, [rows, patientId])
  const [chosen, setChosen] = useState<string[]>([])
  const shown = chosen.map(key => available.find(entry => seriesRefKey(entry.ref) === key)?.ref).filter((ref): ref is MergeSeriesRef => ref !== undefined)
  const displayUnit = shown[0]?.einheit ?? null
  const series = useMemo(() => displayUnit === null ? [] : comparisonSeries(rows, patientId, shown, displayUnit), [rows, patientId, chosen.join('|'), displayUnit])
  const toggle = (key: string, on: boolean) => setChosen(previous => on ? [...previous, key] : previous.filter(k => k !== key))
  const all = series.flatMap(s => s.points)
  const times = all.map(p => p.date.getTime())
  const values = all.map(p => p.value)
  const [xMin, xMax] = times.length ? [Math.min(...times), Math.max(...times)] : [0, 1]
  const [yLow, yHigh] = values.length ? [Math.min(...values), Math.max(...values)] : [0, 1]
  const xSpan = xMax - xMin || YEAR_MS
  const yPad = (yHigh - yLow || Math.abs(yHigh) || 1) * 0.08
  const yMin = yLow - yPad, yMax = yHigh + yPad
  const x = (t: number) => PLOT.left + (t - (xMax === xMin ? xMin - xSpan / 2 : xMin)) / xSpan * (PLOT.right - PLOT.left)
  const y = (v: number) => PLOT.bottom - (v - yMin) / (yMax - yMin) * (PLOT.bottom - PLOT.top)
  const yTicks = niceTicks(yMin, yMax)
  const yLabels = tickLabels(yTicks)
  const xTicks = calendarTicks(xMin, xMax)
  const unitText = displayUnit ?? ''
  return <section className="card wt-series-comparison" aria-labelledby="series-comparison-title" data-testid="series-comparison">
    <h3 id="series-comparison-title">Compare series</h3>
    <p className="wt-muted">Several series of this patient in one chart, for example the same analyte from two laboratories or methods. The first ticked series sets the unit; another unit is converted only for serum creatinine (mg/dl and µmol/l, 88.42 µmol/l per mg/dl). Merging is a separate, deliberate step on the Data page.</p>
    <div className="wt-comparison-options" role="group" aria-label="Series to compare">{available.map(({ ref, values: n }) => {
      const key = seriesRefKey(ref)
      const index = chosen.indexOf(key)
      const convertible = displayUnit === null || index >= 0 || mergeUnitConversion(ref, displayUnit) !== null
      return <label key={key} className={convertible ? undefined : 'wt-muted'}><input type="checkbox" checked={index >= 0} disabled={!convertible} onChange={event => toggle(key, event.target.checked)} />
        {index >= 0 && <span aria-hidden="true" style={{ color: COLORS[index % COLORS.length] }}>{MARK_SYMBOLS[markShape(index)]} </span>}
        {parameterLabel(ref.bezeichnung, ref.einheit)} <span className="wt-muted">({countLabel(n, 'value')}{convertible ? '' : `; not convertible to ${unitText}`})</span></label>
    })}</div>
    {series.length < 2 ? <p className="wt-muted">Tick two or more series to compare them.</p> : <>
      <svg viewBox="0 0 660 300" className="wt-plot" role="group" aria-label={`Comparison of ${series.map(s => parameterLabel(s.ref.bezeichnung, s.ref.einheit)).join(', ')} in ${unitText}, by calendar date`}>
        <title>Series comparison in {unitText}</title>
        {yTicks.map((v, i) => <g key={v}><line x1={PLOT.left} x2={PLOT.right} y1={y(v)} y2={y(v)} stroke="#dce5e9" /><text x="57" y={y(v) + 4} textAnchor="end">{yLabels[i]}</text></g>)}
        {xTicks.map(t => <text key={t} x={x(t)} y="262" textAnchor={x(t) < PLOT.left + 36 ? 'start' : x(t) > PLOT.right - 36 ? 'end' : 'middle'}>{formatDisplayDate(new Date(t))}</text>)}
        <text x="345" y="290" textAnchor="middle">Calendar date; values in {unitText}</text>
        {series.map((s, i) => {
          const color = COLORS[i % COLORS.length]
          const shape = markShape(i)
          const label = parameterLabel(s.ref.bezeichnung, s.ref.einheit)
          const fit = s.fit
          const ends = fit ? [s.points.filter(p => p.operator === '=')[0]?.date.getTime() ?? fit.origin, s.points.filter(p => p.operator === '=').at(-1)?.date.getTime() ?? fit.origin] : []
          return <g key={label} data-series={label} data-shape={shape}>
            {fit && <line data-testid="comparison-line" x1={x(ends[0])} x2={x(ends[1])} y1={y(fit.intercept + fit.slope * (ends[0] - fit.origin) / YEAR_MS)} y2={y(fit.intercept + fit.slope * (ends[1] - fit.origin) / YEAR_MS)} stroke={color} strokeWidth={2} strokeDasharray={i % 2 ? '2 3' : '6 4'}><title>{label}: comparison line {formatFixedDecimals(fit.slope, 3, true)} {unitText}/year</title></line>}
            {s.points.map((p, k) => {
              const open = p.operator !== '='
              const title = `${label}, ${formatDisplayDate(p.date)}: ${open ? `${p.operator} ` : ''}${formatDisplayNumber(p.value)} ${unitText}${s.factor !== 1 ? ` (${formatDisplayNumber(p.original)} ${s.ref.einheit ?? ''} as measured)` : ''}${p.source ? `, from ${p.source}` : ''}${p.labMethod ? `, laboratory or method: ${p.labMethod}` : ''}${open ? ', a bound: not in the comparison line' : ''}`
              return shape === 'circle'
                ? <circle key={k} cx={x(p.date.getTime())} cy={y(p.value)} r={3.5} fill={open ? 'white' : color} stroke={color}><title>{title}</title></circle>
                : <path key={k} d={markPath(shape, x(p.date.getTime()), y(p.value), 3.5)} fill={open ? 'white' : color} stroke={color}><title>{title}</title></path>
            })}
          </g>
        })}
      </svg>
      <div className="wt-table-scroll"><table aria-label="Compared series"><thead><tr><th>Series</th><th>Values</th><th>Period</th><th>Comparison line ({unitText}/year)</th><th>Laboratory or method</th></tr></thead><tbody>{series.map((s, i) => <tr key={seriesRefKey(s.ref)}>
        <td><span aria-hidden="true" style={{ color: COLORS[i % COLORS.length] }}>{MARK_SYMBOLS[markShape(i)]} </span>{parameterLabel(s.ref.bezeichnung, s.ref.einheit)}{s.factor !== 1 ? ` (${s.factor < 1 ? '÷' : '×'} 88.42)` : ''}</td>
        <td>{s.points.length}</td>
        <td>{s.points.length ? `${formatDisplayDate(s.points[0].date)} to ${formatDisplayDate(s.points.at(-1)!.date)}` : '–'}</td>
        <td>{s.fit ? `${formatFixedDecimals(s.fit.slope, 3, true)}${Number.isFinite(s.fit.ciLow) ? ` (95 % CI ${formatFixedDecimals(s.fit.ciLow, 3, true)} to ${formatFixedDecimals(s.fit.ciHigh, 3, true)})` : ' (two dates: no interval)'}` : 'Fewer than two dates'}</td>
        <td>{s.labMethods.length ? s.labMethods.join(', ') : '–'}</td>
      </tr>)}</tbody></table></div>
      <p className="wt-muted">Comparison lines: ordinary least squares over the exact values of each series in {unitText}; no time balancing, censoring or exclusions, and bounds (&lt;, &gt;) are left out. They are for comparing the series and can differ from the slope of a column, which follows its analysis settings. A shift between the lines at the same time points the method or laboratory, not the patient, may explain. Research use only.</p>
    </>}
  </section>
}
