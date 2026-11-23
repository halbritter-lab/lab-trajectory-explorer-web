import type { ClinicalEvent } from '../../core/events/events'
import type { AnchorComparisonSettings, AnchorRule } from '../../core/cohort/anchorComparison'
import { DraftNumberInput } from '../DraftNumberInput'
import { t } from '../../i18n'

const ruleValue = (rule: AnchorRule) => rule.kind === 'first' ? 'first' : `${rule.kind}:${rule.value}`
function ruleFromValue(value: string): AnchorRule {
  if (value.startsWith('title:')) return { kind: 'title', value: value.slice('title:'.length) }
  if (value.startsWith('type:')) return { kind: 'type', value: value.slice('type:'.length) }
  return { kind: 'first' }
}

/** Before/after comparison at an anchor event (issue #64): on or off, the
 * anchor rule and the exclusion window after the anchor in days. */
export function AnchorComparisonSettingsGroup({ settings, events, onChange }: {
  settings: AnchorComparisonSettings | undefined
  events: readonly ClinicalEvent[]
  onChange: (settings: AnchorComparisonSettings | undefined) => void
}) {
  const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))
  const titles = sorted([...events.map(event => event.title), ...(settings?.rule.kind === 'title' ? [settings.rule.value] : [])])
  const types = sorted([...events.map(event => event.type), ...(settings?.rule.kind === 'type' ? [settings.rule.value] : [])])
  const current = settings ?? { rule: { kind: 'first' } as AnchorRule, exclusionDays: 0 }
  return <div className="wt-pipeline-group" data-testid="anchor-comparison-settings">
    <h2>{t('Before/after comparison')}</h2>
    <p className="wt-muted">{t('Slope before and after one anchor event per patient, with the difference (after − before). Measurements on the anchor date count as before. The column’s slope, flags and endpoints stay those of the whole series. Time axis → “Years since event” starts at the same anchor.')}</p>
    <label>
      <input type="checkbox" aria-label={t('Compare slopes before and after an anchor event')} checked={settings !== undefined}
        onChange={event => onChange(event.target.checked ? current : undefined)} />
      {t('Compare slopes before and after an anchor event')}
    </label>
    <label>{t('Anchor event')}
      <select aria-label={t('Anchor event')} disabled={!settings} value={ruleValue(current.rule)} onChange={event => onChange({ ...current, rule: ruleFromValue(event.target.value) })}>
        <option value="first">{t('First event of the patient')}</option>
        {titles.length > 0 && <optgroup label={t('First event with the title')}>{titles.map(title => <option key={title} value={`title:${title}`}>{t('Title: {title}', { title })}</option>)}</optgroup>}
        {types.length > 0 && <optgroup label={t('First event of the type')}>{types.map(type => <option key={type} value={`type:${type}`}>{t('Type: {type}', { type })}</option>)}</optgroup>}
      </select>
    </label>
    <label>{t('Exclusion window after the anchor (days)')}
      <DraftNumberInput min={0} step={1} aria-label={t('Anchor exclusion days')} disabled={!settings} value={current.exclusionDays}
        normalise={days => Math.max(0, Math.trunc(days))} onCommit={exclusionDays => onChange({ ...current, exclusionDays })} />
    </label>
    <p className="wt-muted">{t('Measurements of the days after the anchor up to this number are left out of the after slope only and drawn as grey open circles; 0 leaves none out.')} <a href="#methods/fits/pipeline">{t('Fit pipeline')}</a></p>
  </div>
}
