/**
 * Nephrology analyte recognition: which imported series are serum creatinine,
 * which are eGFR, and how computed eGFR series are named.
 *
 * The creatinine predicates below look alike but are deliberately not unified:
 * each is pinned by a different call site's established behaviour (and some by
 * parity tests), and the variants disagree on edge cases such as surrounding
 * whitespace, non-breaking spaces and unit spelling. Each documents which call
 * sites rely on it. eGFR has one rule, `isEgfrUnit`.
 */
import { unitKey } from '../../parse/units'

export type FormulaName = 'ckd-epi-2021' | 'mdrd-4' | 'ekfc-2021'

/** Human-readable formula names, as they appear in computed series names. */
export const EGFR_FORMULA_LABELS: Record<FormulaName, string> = {
  'ckd-epi-2021': 'CKD-EPI 2021',
  'mdrd-4': 'MDRD-4',
  'ekfc-2021': 'EKFC 2021',
}

/** Closing part of every computed eGFR series name. */
export const COMPUTED_BEZEICHNUNG_SUFFIX = ', computed)'
/** Unit written on computed eGFR rows. */
export const COMPUTED_EGFR_UNIT = 'ml/min/1,73m²'

/** Series name of the eGFR rows the app computes with `formula`. */
export function computedEgfrName(formula: FormulaName): string {
  return `eGFR (${EGFR_FORMULA_LABELS[formula]}${COMPUTED_BEZEICHNUNG_SUFFIX}`
}

/** Units accepted as a serum creatinine source for eGFR, in unit-key form. */
export const SERUM_CREATININE_UNITS = ['mg/dl', 'µmol/l'] as const

/** Comparison form of a unit: the import's unit key (case, spacing and
 * micro-sign spelling ignored), so "mg/dL", "umol/L" and "μmol / l" are
 * recognised as mg/dl and µmol/l. */
export function normaliseUnit(einheit: string | null): string {
  return einheit == null ? '' : unitKey(einheit)
}

function normalisedName(bez: string): string {
  return bez.replace(/ /g, ' ').trim()
}

/** Name mentions creatinine (German or English). Non-breaking spaces and
 * surrounding whitespace are ignored. Used by the eGFR source selection. */
export function isCreatinineName(bez: string | null): boolean {
  if (bez == null) return false
  const s = normalisedName(bez).toLowerCase()
  return s.includes('kreatinin') || s.includes('creatinin')
}

/** Name marks a urine measurement ("urin", "harn", "urine" or an "UR" suffix).
 * Non-breaking spaces and surrounding whitespace are ignored. Used by the eGFR
 * source selection. */
export function isUrineName(bez: string | null): boolean {
  if (bez == null) return false
  const s = normalisedName(bez)
  const low = s.toLowerCase()
  if (low.includes('urin') || low.includes('harn') || low.includes('urine')) return true
  return s.endsWith('UR')
}

/** A serum creatinine series usable as eGFR source: creatinine name, not
 * urine, unit mg/dl or µmol/l in any common spelling. */
export function isSerumCreatinineSeries(bez: string, einheit: string | null): boolean {
  return isCreatinineName(bez) && !isUrineName(bez) && (SERUM_CREATININE_UNITS as readonly string[]).includes(normaliseUnit(einheit))
}

/** Serum creatinine eligible for KDIGO AKI detection. Matches the eGFR source
 * vocabulary; AKI converts µmol/l rows to mg/dl before comparing values. */
export function isKdigoCreatinineSeries(bez: string, einheit: string | null): boolean {
  return isSerumCreatinineSeries(bez, einheit)
}

/** eGFR by unit: mL/min/1.73 m² in any of the usual spellings (letter case,
 * spacing, decimal comma, superscript or caret 2), whatever the series is
 * called. The single rule behind the CKD endpoints, kidney failure reached,
 * the rapid-decline flag and the mixed-model projection presets (decided
 * 2026-10-07). A clearance in ml/min is not eGFR. */
export function isEgfrUnit(einheit: string | null): boolean {
  if (einheit == null) return false
  const normalised = einheit.toLowerCase().replace(/\s/g, '').replace(',', '.').replace('²', '2').replace('^2', '2')
  return normalised === 'ml/min/1.73m2'
}

/** Name mentions eGFR anywhere (case-insensitive). Used only to pick a
 * sensible default parameter for cohort models. */
export function mentionsEgfr(bez: string): boolean {
  return bez.toLowerCase().includes('egfr')
}
