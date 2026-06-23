import { appendComputedEgfr } from '../egfr/series'
import type { LabRow } from '../types'
import type { AnalysisModule, EgfrModuleSettings, ManualDemographics } from './types'

function rowsWithManualDemographics(rows: LabRow[], manual: Record<number, ManualDemographics>): LabRow[] {
  if (Object.keys(manual).length === 0) return rows
  let changed = false
  const mapped = rows.map((r) => {
    const demo = manual[r.patientId]
    if (!demo) return r
    if (demo.sex == null && demo.age === undefined) return r
    changed = true
    return { ...r, patientSex: demo.sex ?? r.patientSex, patientAgeAtLab: demo.age ?? r.patientAgeAtLab }
  })
  return changed ? mapped : rows
}

export const egfrModule: AnalysisModule<EgfrModuleSettings> = {
  id: 'egfr',
  label: 'eGFR',
  defaultSettings: { formula: 'off', source: null },
  apply: (ctx, settings) => {
    const withManual = rowsWithManualDemographics(ctx.rows, ctx.manualDemographics)
    if (settings.formula === 'off') return { rows: withManual }
    return { rows: appendComputedEgfr(withManual, { formula: settings.formula, source: settings.source }) }
  },
}
