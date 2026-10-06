import { appendComputedEgfr } from './series'
import type { AnalysisModule, EgfrModuleSettings } from '../../../analysis/types'

export const egfrModule: AnalysisModule<EgfrModuleSettings> = {
  id: 'egfr',
  label: 'eGFR',
  defaultSettings: { formula: 'off', source: null },
  apply: (ctx, settings) => {
    if (settings.formula === 'off') return {}
    return { rows: appendComputedEgfr(ctx.rows, { formula: settings.formula, source: settings.source }) }
  },
}
