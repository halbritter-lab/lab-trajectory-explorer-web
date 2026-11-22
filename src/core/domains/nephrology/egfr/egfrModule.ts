import { appendComputedEgfr, type Source } from './series'
import { DEFAULT_PAEDIATRIC_RULE, EGFR_FORMULA_LABELS, PAEDIATRIC_RULE_LABELS, type FormulaName, type PaediatricRule } from '../analytes'
import type { AnalysisContext, AnalysisContribution, SettingsModule } from '../../../analysis/types'

export interface EgfrModuleSettings {
  formula: FormulaName | 'off'
  source: Source | null
  /** Rule for rows under 18 while `formula` is an adult formula (issue #66).
   * A stored value without it (saved before 2026-11-22) stays without it and
   * is read as the default `ckid-u25-ekfc` (`DEFAULT_PAEDIATRIC_RULE`). */
  paediatric?: PaediatricRule
}

const FORMULAS: readonly string[] = ['off', ...Object.keys(EGFR_FORMULA_LABELS)]
const PAEDIATRIC_RULES: readonly string[] = Object.keys(PAEDIATRIC_RULE_LABELS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Derived eGFR series from serum creatinine and resolved demographics. */
export const egfrModule = {
  id: 'egfr' as const,
  label: 'eGFR',
  description: 'Computed eGFR series from serum creatinine (CKD-EPI 2021, CKD-EPI 2009, MDRD-4, EKFC 2021, or CKiD U25 and EKFC over the full age range; under 18 CKiD U25 with height, otherwise EKFC, by default).',
  defaultSettings: { formula: 'off', source: null, paediatric: DEFAULT_PAEDIATRIC_RULE } as EgfrModuleSettings,
  parseSettings: (value: unknown): EgfrModuleSettings | null => {
    if (!isRecord(value) || !FORMULAS.includes(value.formula as string)) return null
    const source = value.source
    if (source !== null && !(Array.isArray(source) && source.length === 2 && source.every((part) => typeof part === 'string'))) return null
    if (value.paediatric !== undefined && !PAEDIATRIC_RULES.includes(value.paediatric as string)) return null
    // Kept as stored, like every module value; readers default a missing rule.
    return value as unknown as EgfrModuleSettings
  },
  apply: (ctx: AnalysisContext, settings: EgfrModuleSettings): AnalysisContribution => {
    if (settings.formula === 'off') return {}
    return { rows: appendComputedEgfr(ctx.rows, { formula: settings.formula, source: settings.source, paediatric: settings.paediatric ?? DEFAULT_PAEDIATRIC_RULE }) }
  },
} satisfies SettingsModule<EgfrModuleSettings, 'egfr'>
