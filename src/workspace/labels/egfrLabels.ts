/**
 * The eGFR formula and rule names as the interface shows them (issue #71).
 * Equation names (CKD-EPI 2021, EKFC 2021, …) are proper names and stay as
 * they are; only the descriptive parts are translated. Exports keep the core
 * labels (`EGFR_FORMULA_LABELS` and the others) unchanged.
 */
import type { FormulaName } from '../../core/domains/nephrology/egfr/series'
import { EGFR_FORMULA_LABELS, ROW_EGFR_FORMULA_LABELS, type PaediatricRule, type RowEgfrFormula } from '../../core/domains/nephrology/analytes'
import { t } from '../../i18n'

export function egfrFormulaLabel(formula: FormulaName): string {
  return formula === 'ckd-epi-2009' ? t('CKD-EPI 2009 (race-free)') : EGFR_FORMULA_LABELS[formula]
}

export function rowEgfrFormulaLabel(formula: RowEgfrFormula): string {
  return formula === 'ckd-epi-2009' ? t('CKD-EPI 2009 (race-free)') : ROW_EGFR_FORMULA_LABELS[formula]
}

export function paediatricRuleLabel(rule: PaediatricRule): string {
  return { 'ckid-u25-ekfc': t('CKiD U25 with height, otherwise EKFC'), 'schwartz-bedside': t('Bedside Schwartz with height (comparison only)'), off: t('None (no eGFR under 18)') }[rule]
}
