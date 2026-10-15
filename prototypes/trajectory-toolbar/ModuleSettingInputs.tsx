import type { ColumnModuleSettings, RegisteredAnalysisModule } from '../../src/core/analysis/registry'

export function ModuleSettingInputs({ modules, settings, onChange }: {
  modules: readonly RegisteredAnalysisModule[]
  settings: ColumnModuleSettings
  onChange: (settings: ColumnModuleSettings) => void
}) {
  return <>{modules.flatMap(module => (module.columnSettingFields ?? []).map(field => {
    const current = ((settings as Record<string, Record<string, unknown> | undefined>)[module.id] ?? module.defaultSettings ?? {}) as Record<string, unknown>
    const set = (value: unknown) => onChange({ ...settings, [module.id]: { ...current, [field.key]: value } })
    return field.kind === 'number'
      ? <label key={`${module.id}.${field.key}`}>{field.label}
          <input
            type="number"
            min={field.min}
            step={field.step}
            aria-label={field.ariaLabel}
            value={(current[field.key] as number | undefined) ?? ''}
            onChange={e => set(Math.max(field.min ?? -Infinity, Number(e.target.value) || 0))}
          />
        </label>
      : <label key={`${module.id}.${field.key}`}>
          <input type="checkbox" aria-label={field.ariaLabel} checked={Boolean(current[field.key])} onChange={e => set(e.target.checked)} />
          {field.label}
        </label>
  }))}</>
}
