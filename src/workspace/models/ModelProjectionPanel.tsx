import { useEffect, useRef, useState } from 'react'
import { mixedModelFactors } from '../../core/mixedModel/config'
import { projectionRows, validateProjectionSettings, type ProjectionSettings, type ProjectionSnapshot } from '../../core/projection/projectionSnapshot'
import { projectionTargetPresets } from '../../core/analysis/registry'
import { msg, t, tx } from '../../i18n'

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
  crossing:msg('Projected crossing'), already_met:msg('Target already met at reference time'), flat:msg('Flat trend'),
  away:msg('Trend moves away'), beyond_horizon:msg('Beyond projection horizon'), invalid:msg('Invalid calculation'),
  incompatible_target:msg('Target does not match series'), disabled:msg('Disabled'), unavailable_profile:msg('Profile unavailable'),
}

/** Remaining years of the unapplied draft, computed like the applied table. */
function formatDraftPreview(snapshot: ProjectionSnapshot, draft: ProjectionSettings): string | null {
  const items = projectionRows(snapshot.sourceResult, snapshot.sourceResponse, snapshot.categoryChoices, draft).rows
    .filter(row => row.status !== 'disabled')
    .map(row => row.remainingYears !== null
      ? `${tx(row.target.label)}: ${t('{n} remaining years', { n: row.remainingYears.toFixed(2) })}`
      : `${tx(row.target.label)}: ${tx(STATUS_LABELS[row.status])}`)
  return items.length > 0 ? items.join('; ') : null
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
  const draftPreview = dirty && errors.length === 0 ? formatDraftPreview(snapshot, draft) : null
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
  return <section aria-label={t('Trend projection')} className="model-projection-panel">
    <h3>{t('Trend projection — {outcome} ({value})', { outcome: snapshot.sourceResponse.outcome, value: snapshot.sourceResponse.unit || t('unspecified unit') })}</h3>
    <p>{t("Projected boundary intersections conditional on continuation of the fitted trend. Anchor: fitted model curve, with time in years since each patient's first retained measurement. This fixed-effect profile is not a patient-specific prediction or confirmed clinical staging.")}</p>
    <p>{t('Time uncertainty is not estimated.')}</p>
    {showWarnings && snapshot.warnings.map((warning,index) => <p role="status" key={index}>{warning}</p>)}
    <fieldset><legend>{t('Fixed-effect profile')}</legend>
      {factors.length === 0 && <p>{t('Unadjusted fitted profile.')}</p>}
      {factors.map((factor) => <label key={factor.key}>{factor.key} {factor.kind === 'numeric'
        ? <input aria-label={t('Profile {key}', { key: factor.key })} type="number" step="any" value={Number.isFinite(draft.profile[factor.key]) ? draft.profile[factor.key] : ''} onChange={(event) => setDraft({...draft,profile:{...draft.profile,[factor.key]:numberInput(event.target.value)}})} />
        : <select aria-label={t('Profile {key}', { key: factor.key })} value={draft.profile[factor.key] ?? ''} onChange={(event) => setDraft({...draft,profile:{...draft.profile,[factor.key]:event.target.value}})}><option value="">{t('Choose category')}</option>{(snapshot.categoryChoices[factor.key] ?? []).map((category) => <option key={category} value={category}>{category}</option>)}</select>}
      </label>)}
    </fieldset>
    <label>{t('Reference time (years)')} <input aria-label={t('Reference time (years)')} type="number" min="0" step="any" value={Number.isFinite(draft.referenceTimeYears) ? draft.referenceTimeYears : ''} onChange={(event) => setDraft({...draft,referenceTimeYears:numberInput(event.target.value)})} /></label>
    <label>{t('Horizon (years)')} <input aria-label={t('Horizon (years)')} type="number" min="0" step="any" value={Number.isFinite(draft.horizonYears) ? draft.horizonYears : ''} onChange={(event) => setDraft({...draft,horizonYears:numberInput(event.target.value)})} /></label>
    {draft.targets.map((target,index) => <fieldset key={target.id}><legend>{t('Target {value}', { value: index+1 })}</legend>
      <label><input type="checkbox" aria-label={t('Target {value} enabled', { value: index+1 })} checked={target.enabled} onChange={(event) => updateTarget(index,{enabled:event.target.checked})} />{t('Enabled')}</label>
      <label>{t('Label')} <input aria-label={t('Target {value} label', { value: index+1 })} value={target.label} onChange={(event) => updateTarget(index,{label:event.target.value})} /></label>
      <label>{t('Threshold ({unit})', { unit: target.unit })} <input type="number" step="any" aria-label={t('Target {value} threshold', { value: index+1 })} value={Number.isFinite(target.threshold) ? target.threshold : ''} onChange={(event) => updateTarget(index,{threshold:numberInput(event.target.value)})} /></label>
      <label>{t('Direction')} <select aria-label={t('Target {value} direction', { value: index+1 })} value={target.direction} onChange={(event) => updateTarget(index,{direction:event.target.value as 'below'|'above'})}><option value="below">{t('Below')}</option><option value="above">{t('Above')}</option></select></label>
      <button type="button" aria-label={t('Remove target {value}', { value: index+1 })} onClick={() => setDraft({...draft,targets:draft.targets.filter((_,i) => i !== index)})}>{t('Remove target')}</button>
    </fieldset>)}
    <button type="button" onClick={() => setDraft({...draft,targets:[...draft.targets,{...snapshot.sourceResponse,id:uniqueId('custom'),label:t('Custom target'),threshold:0,direction:'below',enabled:true}]})}>{t('Add custom target')}</button>
    {projectionTargetPresets(snapshot.sourceResponse).map((preset) => <button type="button" key={preset.id} onClick={() => setDraft({...draft,targets:[...draft.targets,{...preset,id:uniqueId(preset.id),enabled:true}]})}>{t('Add {label}', { label: preset.label })}</button>)}
    {errors.length > 0 && <p role="alert">{errors.join(' ')}</p>}
    {dirty && <p role="status">{t('Unapplied projection changes. Results show applied settings.')}</p>}
    {/* Outside the live region, so screen readers are not interrupted on every keystroke. */}
    {draftPreview && <p className="muted" data-testid="projection-draft-preview">{t('Preview of the unapplied settings: {draftPreview}.', { draftPreview })}</p>}
    <button type="button" disabled={!dirty || errors.length > 0} onClick={() => onApply(clone(draft))}>{t('Apply projection settings')}</button>
    <button type="button" disabled={!dirty} onClick={() => setDraft(clone(snapshot.settings))}>{t('Cancel')}</button>
    <div className="model-projection-results"><table className="cohort-model-table" aria-label={t('Projected boundary intersections')}><thead><tr><th>{t('Target')}</th><th>{t('Status')}</th><th>{t('Model time (years)')}</th><th>{t('Remaining years')}</th></tr></thead><tbody>
      {snapshot.rows.map((row) => <tr key={row.target.id}><td>{tx(row.target.label)} ({row.target.direction} {row.target.threshold} {row.target.unit})</td><td>{tx(STATUS_LABELS[row.status])}{row.reason ? `: ${row.reason}` : ''}</td><td>{row.modelTimeYears === null ? '—' : row.modelTimeYears.toFixed(2)}</td><td>{row.remainingYears === null ? '—' : row.remainingYears.toFixed(2)}</td></tr>)}
    </tbody></table></div>
    {snapshot.rows.length === 0 && <p>{t('No projection targets configured.')}</p>}
  </section>
}
