import { useEffect, useRef, useState } from 'react'
import { mixedModelFactors } from '../../core/mixedModel/config'
import { validateProjectionSettings, type ProjectionSettings, type ProjectionSnapshot } from '../../core/projection/projectionSnapshot'
import { projectionTargetPresets } from '../../core/projection/targetPresets'

export interface ModelProjectionPanelProps {
  snapshot: ProjectionSnapshot
  onApply: (settings: ProjectionSettings) => void
  onDirtyChange: (dirty: boolean) => void
  showWarnings?: boolean
}

function clone(settings: ProjectionSettings): ProjectionSettings {
  return {...settings,profile:{...settings.profile},targets:settings.targets.map((target) => ({...target}))}
}
function numberInput(value: string): number { return value.trim() === '' ? NaN : Number(value) }
const STATUS_LABELS: Record<ProjectionSnapshot['rows'][number]['status'],string> = {
  crossing:'Projected crossing', already_met:'Target already met at reference time', flat:'Flat trend',
  away:'Trend moves away', beyond_horizon:'Beyond projection horizon', invalid:'Invalid calculation',
  incompatible_target:'Target does not match series', disabled:'Disabled', unavailable_profile:'Profile unavailable',
}

/** The parent supplies the same current, applied snapshot to this view and export. */
export function ModelProjectionPanel({snapshot,onApply,onDirtyChange,showWarnings = true}: ModelProjectionPanelProps) {
  const [draft,setDraft] = useState(() => clone(snapshot.settings))
  const appliedSignature = JSON.stringify(snapshot.settings)
  const identitySignature = JSON.stringify(snapshot.sourceIdentity)
  useEffect(() => { setDraft(clone(snapshot.settings)) }, [appliedSignature, identitySignature]) // Same-identity refits retain drafts.
  const dirty = JSON.stringify(draft) !== appliedSignature
  const dirtyCallback = useRef(onDirtyChange)
  dirtyCallback.current = onDirtyChange
  useEffect(() => { dirtyCallback.current(dirty) }, [dirty])
  useEffect(() => () => dirtyCallback.current(false), [])
  const errors = validateProjectionSettings(draft,snapshot.sourceResponse)
  const factors = snapshot.sourceResult.metadata.modelConfig ? mixedModelFactors(snapshot.sourceResult.metadata.modelConfig) : []
  function updateTarget(index: number, patch: Partial<ProjectionSettings['targets'][number]>) {
    setDraft((current) => ({...current,targets:current.targets.map((target,i) => i === index ? {...target,...patch} : target)}))
  }
  function uniqueId(base: string) {
    let id = base
    let suffix = 1
    while (draft.targets.some((target) => target.id === id)) id = `${base}-${suffix++}`
    return id
  }
  return <section aria-label="Trend projection" className="model-projection-panel">
    <h4>Trend projection — {snapshot.sourceResponse.outcome} ({snapshot.sourceResponse.unit || 'unspecified unit'})</h4>
    <p>Projected boundary intersections conditional on continuation of the fitted trend. Anchor: fitted model curve, with time in years since each patient's first retained measurement. This fixed-effect profile is not a patient-specific prediction or confirmed clinical staging.</p>
    <p>Time uncertainty is not estimated.</p>
    {showWarnings && snapshot.warnings.map((warning,index) => <p role="status" key={index}>{warning}</p>)}
    <fieldset><legend>Fixed-effect profile</legend>
      {factors.length === 0 && <p>Unadjusted fitted profile.</p>}
      {factors.map((factor) => <label key={factor.key}>{factor.key} {factor.kind === 'numeric'
        ? <input aria-label={`Profile ${factor.key}`} type="number" step="any" value={Number.isFinite(draft.profile[factor.key]) ? draft.profile[factor.key] : ''} onChange={(event) => setDraft({...draft,profile:{...draft.profile,[factor.key]:numberInput(event.target.value)}})} />
        : <select aria-label={`Profile ${factor.key}`} value={draft.profile[factor.key] ?? ''} onChange={(event) => setDraft({...draft,profile:{...draft.profile,[factor.key]:event.target.value}})}><option value="">Choose category</option>{(snapshot.categoryChoices[factor.key] ?? []).map((category) => <option key={category} value={category}>{category}</option>)}</select>}
      </label>)}
    </fieldset>
    <label>Reference time (years) <input aria-label="Reference time (years)" type="number" min="0" step="any" value={Number.isFinite(draft.referenceTimeYears) ? draft.referenceTimeYears : ''} onChange={(event) => setDraft({...draft,referenceTimeYears:numberInput(event.target.value)})} /></label>
    <label>Horizon (years) <input aria-label="Horizon (years)" type="number" min="0" step="any" value={Number.isFinite(draft.horizonYears) ? draft.horizonYears : ''} onChange={(event) => setDraft({...draft,horizonYears:numberInput(event.target.value)})} /></label>
    {draft.targets.map((target,index) => <fieldset key={target.id}><legend>Target {index+1}</legend>
      <label><input type="checkbox" aria-label={`Target ${index+1} enabled`} checked={target.enabled} onChange={(event) => updateTarget(index,{enabled:event.target.checked})} />Enabled</label>
      <label>Label <input aria-label={`Target ${index+1} label`} value={target.label} onChange={(event) => updateTarget(index,{label:event.target.value})} /></label>
      <label>Threshold ({target.unit}) <input type="number" step="any" aria-label={`Target ${index+1} threshold`} value={Number.isFinite(target.threshold) ? target.threshold : ''} onChange={(event) => updateTarget(index,{threshold:numberInput(event.target.value)})} /></label>
      <label>Direction <select aria-label={`Target ${index+1} direction`} value={target.direction} onChange={(event) => updateTarget(index,{direction:event.target.value as 'below'|'above'})}><option value="below">Below</option><option value="above">Above</option></select></label>
      <button type="button" aria-label={`Remove target ${index+1}`} onClick={() => setDraft({...draft,targets:draft.targets.filter((_,i) => i !== index)})}>Remove target</button>
    </fieldset>)}
    <button type="button" onClick={() => setDraft({...draft,targets:[...draft.targets,{...snapshot.sourceResponse,id:uniqueId('custom'),label:'Custom target',threshold:0,direction:'below',enabled:true}]})}>Add custom target</button>
    {projectionTargetPresets(snapshot.sourceResponse).map((preset) => <button type="button" key={preset.id} onClick={() => setDraft({...draft,targets:[...draft.targets,{...preset,id:uniqueId(preset.id),enabled:true}]})}>Add {preset.label}</button>)}
    {errors.length > 0 && <p role="alert">{errors.join(' ')}</p>}
    {dirty && <p role="status">Unapplied projection changes. Results show applied settings.</p>}
    <button type="button" disabled={!dirty || errors.length > 0} onClick={() => onApply(clone(draft))}>Apply projection settings</button>
    <button type="button" disabled={!dirty} onClick={() => setDraft(clone(snapshot.settings))}>Cancel</button>
    <div className="model-projection-results"><table className="cohort-model-table" aria-label="Projected boundary intersections"><thead><tr><th>Target</th><th>Status</th><th>Model time (years)</th><th>Remaining years</th></tr></thead><tbody>
      {snapshot.rows.map((row) => <tr key={row.target.id}><td>{row.target.label} ({row.target.direction} {row.target.threshold} {row.target.unit})</td><td>{STATUS_LABELS[row.status]}{row.reason ? `: ${row.reason}` : ''}</td><td>{row.modelTimeYears === null ? '—' : row.modelTimeYears.toFixed(2)}</td><td>{row.remainingYears === null ? '—' : row.remainingYears.toFixed(2)}</td></tr>)}
    </tbody></table></div>
    {snapshot.rows.length === 0 && <p>No projection targets configured.</p>}
  </section>
}
