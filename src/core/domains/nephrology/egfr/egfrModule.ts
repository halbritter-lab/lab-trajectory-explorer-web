import { appendComputedEgfr, type Source } from './series'
import { EGFR_FORMULA_LABELS, type FormulaName } from '../analytes'
import type { AnalysisContext, AnalysisContribution, SettingsModule } from '../../../analysis/types'

export interface EgfrModuleSettings {
  formula: FormulaName | 'off'
  source: Source | null
}

const FORMULAS: readonly string[] = ['off', ...Object.keys(EGFR_FORMULA_LABELS)]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Derived eGFR series from serum creatinine and resolved demographics. */
export const egfrModule = {
  id: 'egfr' as const,
  label: 'eGFR',
  description: 'Computed eGFR series from serum creatinine (CKD-EPI 2021, MDRD-4 or EKFC 2021).',
  defaultSettings: { formula: 'off', source: null } as EgfrModuleSettings,
  parseSettings: (value: unknown): EgfrModuleSettings | null => {
    if (!isRecord(value) || !FORMULAS.includes(value.formula as string)) return null
    const source = value.source
    if (source !== null && !(Array.isArray(source) && source.length === 2 && source.every((part) => typeof part === 'string'))) return null
    return value as unknown as EgfrModuleSettings
  },
  apply: (ctx: AnalysisContext, settings: EgfrModuleSettings): AnalysisContribution => {
    if (settings.formula === 'off') return {}
    return { rows: appendComputedEgfr(ctx.rows, { formula: settings.formula, source: settings.source }) }
  },
} satisfies SettingsModule<EgfrModuleSettings, 'egfr'>
