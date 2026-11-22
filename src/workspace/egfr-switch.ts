import { ROW_EGFR_FORMULA_LABELS } from '../core/domains/nephrology/analytes'
import { fitCrossesFormulaSwitch, type EgfrFormulaSwitch } from '../core/domains/nephrology/egfr/series'
import type { CohortCell } from '../core/cohort/screening'

const isoDay = (date: Date) => date.toISOString().slice(0, 10)

/** "CKiD U25 → CKD-EPI 2021 on 2024-03-02". */
export function formulaSwitchText(change: EgfrFormulaSwitch): string {
  return `${ROW_EGFR_FORMULA_LABELS[change.from]} → ${ROW_EGFR_FORMULA_LABELS[change.to]} on ${isoDay(change.date)}`
}

/** Why a change of equation matters for a slope (issue #66, decision `switch`). */
export const FORMULA_SWITCH_REASON = 'The equations do not agree at a change (Pottel 2019: a mean jump of 23 mL/min/1.73 m² from CKiD to CKD-EPI at 18 years), so part of this slope can come from the change of equation rather than from kidney function.'

/** The notice of a computed eGFR cell whose fitted slope spans a change of
 * the eGFR equation; null without a slope or without such a change. */
export function formulaSwitchNote(cell: Pick<CohortCell, 'slope' | 'firstFittedDate' | 'lastFittedDate'>, switches: readonly EgfrFormulaSwitch[] | undefined): { label: string; title: string } | null {
  if (!Number.isFinite(cell.slope)) return null
  const crossed = fitCrossesFormulaSwitch(switches, cell.firstFittedDate, cell.lastFittedDate)
  if (!crossed.length) return null
  return {
    label: 'Formula change in fit',
    title: `This slope is fitted across a change of the eGFR equation: ${crossed.map(formulaSwitchText).join('; ')}. ${FORMULA_SWITCH_REASON}`,
  }
}
