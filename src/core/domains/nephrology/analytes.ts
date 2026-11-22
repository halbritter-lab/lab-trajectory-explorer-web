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

/** The dataset's eGFR formula setting. `ckid-u25-ekfc` is the full-age rule
 * (issue #66, 2026-11-22): CKiD U25 from 2 to 25 years where a height is
 * available, EKFC otherwise and above 25; it changes adults too. The other
 * four are adult formulas; minors follow the separate under-18 rule. */
export type FormulaName = 'ckd-epi-2021' | 'ckd-epi-2009' | 'mdrd-4' | 'ekfc-2021' | 'ckid-u25-ekfc'

/** Human-readable formula names, as they appear in computed series names. */
export const EGFR_FORMULA_LABELS: Record<FormulaName, string> = {
  'ckd-epi-2021': 'CKD-EPI 2021',
  'ckd-epi-2009': 'CKD-EPI 2009 (race-free)',
  'mdrd-4': 'MDRD-4',
  'ekfc-2021': 'EKFC 2021',
  'ckid-u25-ekfc': 'CKiD U25 / EKFC',
}

/** The equation behind one computed eGFR row (`LabRow.egfrFormula`). */
export type RowEgfrFormula = 'ckd-epi-2021' | 'ckd-epi-2009' | 'mdrd-4' | 'ekfc-2021' | 'ckid-u25' | 'schwartz-bedside'

export const ROW_EGFR_FORMULA_LABELS: Record<RowEgfrFormula, string> = {
  'ckd-epi-2021': 'CKD-EPI 2021',
  'ckd-epi-2009': 'CKD-EPI 2009 (race-free)',
  'mdrd-4': 'MDRD-4',
  'ekfc-2021': 'EKFC 2021',
  'ckid-u25': 'CKiD U25',
  'schwartz-bedside': 'Bedside Schwartz',
}

/** What rows under 18 use while an adult formula is set (issue #66):
 * `ckid-u25-ekfc` (default) CKiD U25 with a height, else EKFC, from age 2;
 * `schwartz-bedside` bedside Schwartz with a height, else no value, from age
 * 2; `off` no value under 18 (the rule up to 2026-11-22). Ignored under the
 * full-age formula `ckid-u25-ekfc`. */
export type PaediatricRule = 'ckid-u25-ekfc' | 'schwartz-bedside' | 'off'

export const PAEDIATRIC_RULE_LABELS: Record<PaediatricRule, string> = {
  'ckid-u25-ekfc': 'CKiD U25 with height, otherwise EKFC',
  'schwartz-bedside': 'Bedside Schwartz with height (comparison only)',
  off: 'None (no eGFR under 18)',
}

export const DEFAULT_PAEDIATRIC_RULE: PaediatricRule = 'ckid-u25-ekfc'

/** Body-height names accepted for the height series (issue #66), compared
 * after Unicode normalisation (NFC), non-breaking spaces read as spaces,
 * whitespace runs collapsed, trimming and lower-casing. Exact names only, so
 * "Größe Niere" or "Größe Zyste" are not read as body height. */
export const HEIGHT_NAMES: ReadonlySet<string> = new Set([
  'größe', 'groesse', 'grösse', 'körpergröße', 'koerpergroesse', 'körpergrösse', 'körperlänge', 'koerperlaenge',
  'height', 'body height', 'body length',
])
/** LOINC codes of body height: 8302-2 (body height), 8306-3 (lying),
 * 8308-9 (standing). A row with one of them is a height whatever its name. */
export const HEIGHT_LOINC: ReadonlySet<string> = new Set(['8302-2', '8306-3', '8308-9'])

/** A body-height row usable for CKiD U25 and bedside Schwartz: unit cm (unit
 * key, so `CM` counts; `m` and `mm` do not) and a name of `HEIGHT_NAMES` or a
 * code of `HEIGHT_LOINC`. */
export function isHeightSeries(bez: string | null, einheit: string | null, loinc: string | null = null): boolean {
  if (normaliseUnit(einheit) !== 'cm') return false
  if (loinc !== null && HEIGHT_LOINC.has(loinc.trim())) return true
  if (bez == null) return false
  return HEIGHT_NAMES.has(bez.normalize('NFC').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase())
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

/** Name substrings (lower case) that mark a material other than serum or
 * plasma: urine, dialysate, puncture fluid, secretions, lymph and other body
 * fluids. */
const NON_SERUM_SUBSTRINGS = ['urin', 'harn', 'dialysat', 'punktat', 'fluid', 'aszites', 'ascites', 'pleura', 'liquor', 'drainage', 'sekret', 'lymphe']
/** Whole name tokens (lower case, trailing dots removed) that mark a non-serum
 * material: urine (`i.U.` im Urin, a lone `U`, `SU`/`SU24h` Sammelurin, `SPU`
 * Spontanurin), `PU` (Punktat or Portionsurin, both non-serum), `CSF`,
 * `Drain`, `PD` (peritoneal dialysate) and `Serom`. */
const NON_SERUM_TOKENS: ReadonlySet<string> = new Set(['i.u', 'u', 'su', 'su24h', 'spu', 'pu', 'csf', 'drain', 'pd', 'serom'])

/** A lone `u` or `u.` is the German abbreviation of "und", not urine, only
 * between two blood-material words (Serum, Plasma, Vollblut, HP, S, P; `i.S.`
 * and `i.P.` end in S and P) or in "vor u. nach" (decided 2026-11-15). Only
 * whitespace separates it from both words; the word before may carry one dot
 * and a closing bracket, the word after an opening bracket. Any other lone
 * `u` stays urine, so an unknown spelling is excluded visibly rather than
 * read as serum. */
const BLOOD_WORD = String.raw`(?<![\p{L}\p{N}])(?:serum|plasma|vollblut|hp|s|p)(?![\p{L}\p{N}])`
const UND_ABBREVIATION = new RegExp(
  String.raw`(?<=${BLOOD_WORD}\.?[)\]]?\s+)u\.?\s+(?=[(\[]?${BLOOD_WORD})|(?<=(?<![\p{L}\p{N}])vor\s+)u\.?\s+(?=nach(?![\p{L}\p{N}]))`, 'gu')

/** Name marks a measurement in a material other than serum or plasma: a
 * substring of `NON_SERUM_SUBSTRINGS` in any case, a token of
 * `NON_SERUM_TOKENS`, or an upper-case "UR" suffix. Tokens are split at
 * whitespace, `,`, `;`, `:`, `/`, `_`, `-`, parentheses and square brackets,
 * after `i. U` is read as `i.U` and a `u` that abbreviates "und" (see
 * `UND_ABBREVIATION`; decided 2026-11-15) is removed. Non-breaking spaces and
 * surrounding whitespace are ignored. Used by the eGFR source selection and,
 * through it, by KDIGO AKI detection. */
export function isNonSerumName(bez: string | null): boolean {
  if (bez == null) return false
  const s = normalisedName(bez)
  const low = s.toLowerCase()
  if (NON_SERUM_SUBSTRINGS.some((part) => low.includes(part))) return true
  const tokens = low.replace(/\bi\.\s+u\b/g, 'i.u').replace(UND_ABBREVIATION, '').split(/[\s,;:()[\]/_-]+/)
  if (tokens.some((token) => NON_SERUM_TOKENS.has(token.replace(/\.+$/, '')))) return true
  return s.endsWith('UR')
}

/**
 * LOINC codes that mark creatinine measured in a material other than serum,
 * plasma or blood, with the material named in the series label (decided
 * 2026-11-21): 2161-8 (mass concentration in urine) and 14683-7 (substance
 * concentration in urine). Whole-blood codes such as 38483-4 and 59826-8 are
 * not listed: they stay eligible like serum.
 */
export const NON_SERUM_CREATININE_LOINC: Readonly<Record<string, string>> = { '2161-8': 'urine', '14683-7': 'urine' }

/**
 * The series name for a creatinine row whose LOINC code marks a non-serum
 * material: the imported name followed by " (urine, LOINC 2161-8)". Returns
 * null when the name is not creatinine, the code is not in
 * `NON_SERUM_CREATININE_LOINC`, or the name already marks a non-serum material
 * (the row is then separate and excluded by its name). The label contains the
 * material word, so `isNonSerumName` holds for it and the series is excluded
 * from the eGFR source selection and from KDIGO AKI detection like every other
 * non-serum name. The LOINC column marks the material for creatinine only; for
 * all other tests it neither separates nor joins series.
 */
export function nonSerumCreatinineLoincName(bez: string | null, loinc: string | null): string | null {
  if (bez === null || loinc === null || !isCreatinineName(bez) || isNonSerumName(bez)) return null
  const code = loinc.trim()
  const material = Object.hasOwn(NON_SERUM_CREATININE_LOINC, code) ? NON_SERUM_CREATININE_LOINC[code] : undefined
  return material === undefined ? null : `${bez} (${material}, LOINC ${code})`
}

/** `nonSerumCreatinineLoincName` as the lab import's series rule (see
 * `LabImportOptions.separateSeries`), with the consequence the import reports. */
export function nonSerumCreatinineSeries(bez: string | null, loinc: string | null): { name: string; consequence: string } | null {
  const name = nonSerumCreatinineLoincName(bez, loinc)
  return name === null ? null : { name, consequence: 'the code marks creatinine that is not from serum, so it is not used for AKI detection or eGFR' }
}

/** A serum creatinine series usable as eGFR source: creatinine name, not a
 * non-serum material, unit mg/dl or µmol/l in any common spelling. */
export function isSerumCreatinineSeries(bez: string, einheit: string | null): boolean {
  return isCreatinineName(bez) && !isNonSerumName(bez) && (SERUM_CREATININE_UNITS as readonly string[]).includes(normaliseUnit(einheit))
}

/** Serum creatinine eligible for KDIGO AKI detection. Matches the eGFR source
 * vocabulary; AKI converts µmol/l rows to mg/dl before comparing values. */
export function isKdigoCreatinineSeries(bez: string, einheit: string | null): boolean {
  return isSerumCreatinineSeries(bez, einheit)
}

/** The spellings of mL/min/1.73 m² accepted as eGFR, after `isEgfrUnit` has
 * lower-cased the unit, removed whitespace and read a decimal comma as a point
 * and `²` or `^2` as `2`: the plain form, UCUM (`mL/min/{1.73_m2}`), "qm" for
 * square metres, and "per" before the body surface area (`mL/min per 1.73 m2`). */
const EGFR_UNIT_SPELLINGS: ReadonlySet<string> = new Set(['ml/min/1.73m2', 'ml/min/{1.73_m2}', 'ml/min/1.73qm', 'ml/minper1.73m2'])

/** eGFR by unit: mL/min/1.73 m² in any of the accepted spellings (letter case,
 * spacing, decimal comma, superscript or caret 2, and the forms listed in
 * `EGFR_UNIT_SPELLINGS`), whatever the series is called. The single rule
 * behind the CKD endpoints, kidney failure reached, the rapid-decline flag and
 * the mixed-model projection presets (decided 2026-10-07; UCUM, "qm" and
 * "per" spellings added 2026-10-08). A clearance in ml/min is not eGFR. */
export function isEgfrUnit(einheit: string | null): boolean {
  if (einheit == null) return false
  const normalised = einheit.toLowerCase().replace(/\s/g, '').replace(',', '.').replace('²', '2').replace('^2', '2')
  return EGFR_UNIT_SPELLINGS.has(normalised)
}

/** Name mentions eGFR anywhere (case-insensitive). Used only to pick a
 * sensible default parameter for cohort models. */
export function mentionsEgfr(bez: string): boolean {
  return bez.toLowerCase().includes('egfr')
}
