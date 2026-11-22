import { useMemo, useState } from 'react'
import { applySeriesMerges, seriesRefKey, type MergeSeriesRef, type SeriesMerge } from '../core/analysis/seriesMerge'
import { mergeUnitConversion, seriesMerges } from '../core/domains/nephrology/seriesMergeModule'
import { MGDL_PER_UMOLL } from '../core/domains/nephrology/constants'
import { unitKey } from '../core/parse/units'
import { useAppStore } from './state/store'
import type { WorkspaceData } from './workspace-data'
import { countLabel, parameterLabel } from './workspace-labels'

const refLabel = (ref: MergeSeriesRef) => parameterLabel(ref.bezeichnung, ref.einheit)

/** Why a draft merge cannot be formed, or null. Pure, for the form and tests:
 * at least two series, a name, a name and unit not already used by an
 * imported series or another merge, no series already merged, and every unit
 * the target unit or a known pair (serum creatinine mg/dl and µmol/l). */
export function draftMergeProblem(draft: SeriesMerge, imported: readonly MergeSeriesRef[], existing: readonly SeriesMerge[]): string | null {
  if (draft.sources.length < 2) return 'Choose at least two series.'
  if (draft.name.trim() === '') return 'Enter a name for the merged series.'
  const target = seriesRefKey({ bezeichnung: draft.name.trim(), einheit: draft.unit })
  if (imported.some(ref => seriesRefKey(ref) === target)) return `${parameterLabel(draft.name.trim(), draft.unit)} is an imported series: choose another name.`
  if (existing.some(merge => seriesRefKey({ bezeichnung: merge.name, einheit: merge.unit }) === target)) return `A merged series ${parameterLabel(draft.name.trim(), draft.unit)} exists already.`
  const used = new Set(existing.flatMap(merge => merge.sources.map(seriesRefKey)))
  const taken = draft.sources.find(source => used.has(seriesRefKey(source)))
  if (taken) return `${refLabel(taken)} already belongs to a merged series; a series can be merged once.`
  const unconvertible = draft.sources.filter(source => mergeUnitConversion(source, draft.unit) === null)
  if (unconvertible.length) return `${unconvertible.map(refLabel).join(', ')} cannot be converted to ${draft.unit}: only the same unit, or serum creatinine between mg/dl and µmol/l, can be merged.`
  return null
}

const factorText = (factor: number, unit: string) => factor === 1 ? 'unchanged' : factor < 1 ? `÷ ${MGDL_PER_UMOLL} into ${unit}` : `× ${MGDL_PER_UMOLL} into ${unit}`

/**
 * Data page, "Merge series" (issue #68): the deliberate merge of chosen
 * imported series into one derived series. Never automatic: the LOINC choice
 * only ticks the series that carry a code, and the merge needs the button.
 * The analysis applies the list at once; removing a merge removes its series.
 */
export function WorkspaceSeriesMerge({ data }: { data: WorkspaceData }) {
  const merges = seriesMerges(data.analysisSettings)
  const imported = useMemo(() => data.parameters.filter(p => !p.derived).map(p => ({ bezeichnung: p.bezeichnung, einheit: p.einheit })), [data.parameters])
  const counts = useMemo(() => {
    const byKey = new Map<string, { values: number; patients: Set<string>; loinc: Set<string> }>()
    for (const row of data.rawRows) {
      if (row.bezeichnung === null) continue
      const key = seriesRefKey({ bezeichnung: row.bezeichnung, einheit: row.einheit })
      const entry = byKey.get(key) ?? { values: 0, patients: new Set(), loinc: new Set() }
      entry.values++; entry.patients.add(String(row.patientId)); if (row.loinc) entry.loinc.add(row.loinc)
      byKey.set(key, entry)
    }
    return byKey
  }, [data.rawRows])
  // LOINC codes carried by at least two imported series: a suggestion, never a merge.
  const loincCodes = useMemo(() => {
    const byCode = new Map<string, MergeSeriesRef[]>()
    for (const ref of imported) for (const code of counts.get(seriesRefKey(ref))?.loinc ?? []) byCode.set(code, [...(byCode.get(code) ?? []), ref])
    return [...byCode].filter(([, refs]) => refs.length > 1).sort(([a], [b]) => a.localeCompare(b))
  }, [imported, counts])
  const [chosen, setChosen] = useState<string[]>([])
  const [loinc, setLoinc] = useState('')
  const [unit, setUnit] = useState('')
  const [name, setName] = useState('')
  const chosenRefs = imported.filter(ref => chosen.includes(seriesRefKey(ref)))
  const units = [...new Map(chosenRefs.filter(ref => ref.einheit !== null).map(ref => [unitKey(ref.einheit!), ref.einheit!])).values()]
  const targetUnit = units.includes(unit) ? unit : units[0] ?? ''
  const defaultName = chosenRefs.length ? `${chosenRefs[0].bezeichnung} (merged)` : ''
  const draft: SeriesMerge = { name: (name || defaultName).trim(), unit: targetUnit, sources: chosenRefs, ...(loinc ? { loinc } : {}) }
  const problem = draftMergeProblem(draft, imported, merges)
  const applied = useMemo(() => applySeriesMerges(data.rawRows, merges, mergeUnitConversion), [data.rawRows, merges])
  const skippedMessages = data.analysis.messages.filter(message => message.id.startsWith('series-merge-'))
  const toggle = (key: string, on: boolean) => { setLoinc(''); setChosen(previous => on ? [...previous, key] : previous.filter(k => k !== key)) }
  const chooseLoinc = (code: string) => {
    setLoinc(code)
    setChosen(code ? (loincCodes.find(([c]) => c === code)?.[1] ?? []).map(seriesRefKey) : [])
  }
  const merge = () => {
    if (problem) return
    useAppStore.getState().setSeriesMerges([...merges, draft])
    setChosen([]); setLoinc(''); setName(''); setUnit('')
  }
  const remove = (index: number) => useAppStore.getState().setSeriesMerges(merges.filter((_, i) => i !== index))
  return <section className="card" id="data-series-merge" aria-labelledby="series-merge-title">
    <h2 id="series-merge-title">4. Merge series</h2>
    <p>Values of one analyte from different laboratories or methods stay separate series. Merging is a deliberate step: values from different laboratories may not be comparable (for example Jaffe and enzymatic creatinine), so compare the series of a patient first (Trajectories → patient view → “Compare series”). A merge adds a derived series; the source series stay, and every merged value names its source. <a href="#methods/data">Import and series details</a></p>
    {merges.length > 0 && <ul className="series-merge-list" aria-label="Merged series">{merges.map((merge, index) => {
      const result = applied.applied.find(a => a.merge === merge)
      return <li key={`${merge.name}|${merge.unit}`}><strong>{parameterLabel(merge.name, merge.unit)}</strong>{merge.loinc ? ` (chosen by LOINC ${merge.loinc})` : ''}: {merge.sources.map((source, i) => `${refLabel(source)}${result ? `, ${countLabel(result.counts[i], 'value')}, ${factorText(result.factors[i], merge.unit)}` : ''}`).join('; ')}.
        {result && result.crossSourceDays > 0 && <> {countLabel(result.crossSourceDays, 'patient-day')} with values of two or more sources: all are kept.</>}
        {' '}<button type="button" aria-label={`Remove merged series ${parameterLabel(merge.name, merge.unit)}`} onClick={() => remove(index)}>Remove</button></li>
    })}</ul>}
    {skippedMessages.map(message => <p key={message.id} className="notice amber" role="status">{message.text}</p>)}
    <fieldset className="series-merge-form">
      <legend>New merged series</legend>
      {loincCodes.length > 0 && <label className="field">Choose by LOINC code<select aria-label="Choose series by LOINC code" value={loinc} onChange={event => chooseLoinc(event.target.value)}>
        <option value="">By name (tick below)</option>
        {loincCodes.map(([code, refs]) => <option key={code} value={code}>LOINC {code}: {refs.map(refLabel).join(', ')}</option>)}
      </select></label>}
      <div className="series-merge-options" role="group" aria-label="Series to merge">{imported.map(ref => {
        const key = seriesRefKey(ref)
        const entry = counts.get(key)
        return <label key={key}><input type="checkbox" checked={chosen.includes(key)} onChange={event => toggle(key, event.target.checked)} />{refLabel(ref)} <span className="muted">({countLabel(entry?.values ?? 0, 'value')}, {countLabel(entry?.patients.size ?? 0, 'patient')}{entry?.loinc.size ? `, LOINC ${[...entry.loinc].join(', ')}` : ''})</span></label>
      })}</div>
      <div className="data-import-grid">
        <label className="field">Unit of the merged series<select aria-label="Unit of the merged series" value={targetUnit} disabled={!units.length} onChange={event => setUnit(event.target.value)}>{units.map(u => <option key={u} value={u}>{u}</option>)}</select></label>
        <label className="field">Name of the merged series<input aria-label="Name of the merged series" value={name} placeholder={defaultName} onChange={event => setName(event.target.value)} /></label>
      </div>
      <p className="muted">Units are converted only for serum creatinine between mg/dl and µmol/l (88.42 µmol/l per mg/dl); other series must have the same unit. Values of two sources on the same day are all kept. Merged rows can be chosen as the eGFR creatinine source under “Derive eGFR”; until then the eGFR reads its source series as before.</p>
      {chosen.length > 0 && problem && <p className="notice amber" role="status">{problem}</p>}
      <button type="button" className="primary" disabled={problem !== null} onClick={merge}>Merge selected series</button>
    </fieldset>
  </section>
}
