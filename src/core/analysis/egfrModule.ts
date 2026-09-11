import { appendComputedEgfr } from '../egfr/series'
import type { AnalysisModule, EgfrModuleSettings } from './types'

export const egfrModule: AnalysisModule<EgfrModuleSettings> = {
  id: 'egfr',
  label: 'eGFR',
  defaultSettings: { formula: 'off', source: null },
  apply: (ctx, settings) => {
    if (settings.formula === 'off') return {}
    return { rows: appendComputedEgfr(ctx.rows, { formula: settings.formula, source: settings.source }) }
  },
}
