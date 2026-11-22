import { patientIdKey, type LabRow, type WertOperator } from '../../../types'
import { bedsideSchwartz, ckdEpi2009, ckdEpi2021, CKID_U25_MAX_AGE, ckidU25, ekfc2021, mdrd4, MIN_PAEDIATRIC_EGFR_AGE, normaliseSex, type HeightEgfrInput } from './formulas'
import { IMPLAUSIBLE_EGFR_ABOVE, MGDL_PER_UMOLL } from '../constants'
import { isExactMeasurement } from '../../../measurements/censored'
import {
  COMPUTED_EGFR_UNIT,
  computedEgfrName,
  DEFAULT_PAEDIATRIC_RULE,
  isHeightSeries,
  isSerumCreatinineSeries,
  normaliseUnit,
  type FormulaName,
  type PaediatricRule,
  type RowEgfrFormula,
} from '../analytes'

export { COMPUTED_BEZEICHNUNG_SUFFIX, normaliseUnit, type FormulaName, type PaediatricRule, type RowEgfrFormula } from '../analytes'
export { MGDL_PER_UMOLL } from '../constants'

const ROW_FORMULA_FN: Record<RowEgfrFormula, (i: HeightEgfrInput) => number> = {
  'ckd-epi-2021': ckdEpi2021,
  'ckd-epi-2009': ckdEpi2009,
  'mdrd-4': mdrd4,
  'ekfc-2021': ekfc2021,
  'ckid-u25': ckidU25,
  'schwartz-bedside': bedsideSchwartz,
}
const MS_PER_DAY = 86_400_000
const OP_FLIP: Record<string, WertOperator> = { '<': '>', '>': '<', '=': '=' }

export type Source = [string, string]

/** Distinct serum-creatinine (Bezeichnung, Einheit) pairs eligible as an eGFR
 * source, mg/dl-first then by name. Mirrors creatinine_source_options. */
export function creatinineSourceOptions(rows: LabRow[]): Source[] {
  const seen = new Map<string, Source>()
  for (const r of rows) {
    if (r.bezeichnung == null || r.einheit == null) continue
    const key = `${r.bezeichnung}|${r.einheit}`
    if (seen.has(key)) continue
    if (isSerumCreatinineSeries(r.bezeichnung, r.einheit)) {
      seen.set(key, [r.bezeichnung, r.einheit])
    }
  }
  return [...seen.values()].sort(bySourceOrder)
}

/** mg/dl before µmol/l, then by lower-cased name. */
function bySourceOrder(a: Source, b: Source): number {
  return Number(normaliseUnit(a[1]) !== 'mg/dl') - Number(normaliseUnit(b[1]) !== 'mg/dl') || a[0].toLowerCase().localeCompare(b[0].toLowerCase())
}

export function isSerumCreatinineSource(source: Source): boolean {
  const [bez, einheit] = source
  return isSerumCreatinineSeries(bez, einheit)
}

const PREFERRED_HINTS = ['hp']

/** Best-guess default source. Mirrors default_creatinine_source. */
export function defaultCreatinineSource(options: Source[]): Source | null {
  if (options.length === 0) return null
  for (const [bez, einheit] of options) if (bez.trim().toLowerCase() === 'kreatinin' && normaliseUnit(einheit) === 'mg/dl') return [bez, einheit]
  for (const [bez, einheit] of options) if (normaliseUnit(einheit) === 'mg/dl' && PREFERRED_HINTS.some((h) => bez.toLowerCase().includes(h))) return [bez, einheit]
  for (const [bez, einheit] of options) if (normaliseUnit(einheit) === 'mg/dl') return [bez, einheit]
  for (const [bez, einheit] of options) if (normaliseUnit(einheit) === 'µmol/l') return [bez, einheit]
  return options[0]
}

export interface EgfrOptions {
  formula?: FormulaName
  source?: Source | null
  /** Rule for rows under 18 while `formula` is an adult formula; default
   * `ckid-u25-ekfc` (issue #66). */
  paediatric?: PaediatricRule
}

/** Longest distance, in calendar days, between a creatinine value and each
 * height it is interpolated from (issue #66, a rule of this tool): 90 days,
 * 30 days when the patient is under 2 at the creatinine date. */
export const HEIGHT_MATCH_DAYS = 90
export const HEIGHT_MATCH_DAYS_UNDER_2 = 30

/** One measured height of a patient: the UTC calendar day and the height in
 * cm (the mean of the exact values of that day). */
export interface HeightPoint { day: number; cm: number }

const utcDay = (date: Date) => Math.floor(date.getTime() / MS_PER_DAY)

/** The measured heights of every patient, oldest first, keyed by
 * patientIdKey. A row counts when `isHeightSeries` holds for its name, unit
 * and LOINC code and it is an exact dated value above 0 (bounds, ranges and
 * unparseable values are left out). Every recognised height series of a
 * patient is used together; several values of one day are averaged. */
export function patientHeights(rows: readonly LabRow[]): Map<string, HeightPoint[]> {
  const byPatient = new Map<string, Map<number, number[]>>()
  for (const r of rows) {
    if (r.sourceSeries || r.labDatum === null || r.wertNum === null || !(r.wertNum > 0) || !isExactMeasurement(r)) continue
    if (!isHeightSeries(r.bezeichnung, r.einheit, r.loinc)) continue
    const key = patientIdKey(r.patientId)
    const days = byPatient.get(key) ?? new Map<number, number[]>()
    byPatient.set(key, days)
    const day = utcDay(r.labDatum)
    days.set(day, [...(days.get(day) ?? []), r.wertNum])
  }
  const out = new Map<string, HeightPoint[]>()
  for (const [key, days] of byPatient) {
    out.set(key, [...days].map(([day, values]) => ({ day, cm: values.reduce((a, b) => a + b, 0) / values.length })).sort((a, b) => a.day - b.day))
  }
  return out
}

/** The height for a creatinine value, or why there is none:
 * - `no_height`: the patient has no usable height at all;
 * - `height_gap`: no height on the date, and the date does not lie between
 *   two heights that are both at most `limitDays` calendar days away.
 * A height of the same day is used as measured. Otherwise the value is
 * interpolated linearly in calendar days between the last height before and
 * the first after; it is never extrapolated, so a date before the first or
 * after the last height has none, however close. */
export type HeightMatch = { cm: number; basis: 'measured' | 'interpolated' } | { gap: 'no_height' | 'height_gap' }

export function heightOnDate(points: readonly HeightPoint[] | undefined, date: Date, limitDays: number): HeightMatch {
  if (!points || points.length === 0) return { gap: 'no_height' }
  const day = utcDay(date)
  const same = points.find(p => p.day === day)
  if (same) return { cm: same.cm, basis: 'measured' }
  let before: HeightPoint | undefined
  let after: HeightPoint | undefined
  for (const p of points) {
    if (p.day < day) before = p
    else if (p.day > day) { after = p; break }
  }
  if (!before || !after || day - before.day > limitDays || after.day - day > limitDays) return { gap: 'height_gap' }
  return { cm: before.cm + (after.cm - before.cm) * (day - before.day) / (after.day - before.day), basis: 'interpolated' }
}

/** Why a row's age or height allows no formula (issue #66). */
export type EgfrAgeGap = 'age' | 'under_18' | 'under_2' | 'no_height' | 'height_gap'

export interface EgfrRule { formula: FormulaName; paediatric: PaediatricRule }

/** The equation a creatinine row of whole-year age `age` on `date` uses, with
 * the height it needs, or why none applies. The first matching rule decides:
 *
 * 1. no age: none (`age`);
 * 2. adult formula (CKD-EPI 2021/2009, MDRD-4, EKFC 2021), age ≥ 18: that formula;
 * 3. adult formula, under-18 rule `off`: none (`under_18`);
 * 4. age < 2: none (`under_2`);
 * 5. full-age formula `ckid-u25-ekfc`, age ≥ 26: EKFC 2021;
 * 6. under-18 rule `schwartz-bedside`: bedside Schwartz with a height, else
 *    none (`no_height` or `height_gap`);
 * 7. otherwise (rule `ckid-u25-ekfc` for 2 to 17, or the full-age formula for
 *    2 to 25): CKiD U25 with a height, else EKFC 2021. */
export function rowEgfrFormula(age: number | null, date: Date, rule: EgfrRule, heights: readonly HeightPoint[] | undefined): { formula: RowEgfrFormula; heightCm?: number } | { gap: EgfrAgeGap } {
  if (age === null || Number.isNaN(age)) return { gap: 'age' }
  const fullAge = rule.formula === 'ckid-u25-ekfc'
  if (!fullAge && age >= 18) return { formula: rule.formula as RowEgfrFormula }
  if (!fullAge && rule.paediatric === 'off') return { gap: 'under_18' }
  if (age < MIN_PAEDIATRIC_EGFR_AGE) return { gap: 'under_2' }
  if (fullAge && age > CKID_U25_MAX_AGE) return { formula: 'ekfc-2021' }
  const height = heightOnDate(heights, date, age < 2 ? HEIGHT_MATCH_DAYS_UNDER_2 : HEIGHT_MATCH_DAYS)
  if (!fullAge && rule.paediatric === 'schwartz-bedside') return 'gap' in height ? height : { formula: 'schwartz-bedside', heightCm: height.cm }
  return 'gap' in height ? { formula: 'ekfc-2021' } : { formula: 'ckid-u25', heightCm: height.cm }
}

/** A change of the equation between two consecutive computed eGFR values of
 * one patient (issue #66, decision `switch`): `date` is the first value with
 * the new equation. */
export interface EgfrFormulaSwitch { date: Date; from: RowEgfrFormula; to: RowEgfrFormula }

/** Every patient's formula changes, keyed by patientIdKey, oldest first. Reads
 * the computed eGFR rows (`sourceSeries` and `egfrFormula` set) in date order;
 * rows of one day share their equation, because it depends on the age and the
 * height of the day only. Patients without a change are absent. */
export function egfrFormulaSwitches(rows: readonly LabRow[]): Map<string, EgfrFormulaSwitch[]> {
  const byPatient = new Map<string, LabRow[]>()
  for (const r of rows) {
    if (!r.sourceSeries || !r.egfrFormula || r.labDatum === null) continue
    const key = patientIdKey(r.patientId)
    const list = byPatient.get(key)
    if (list) list.push(r)
    else byPatient.set(key, [r])
  }
  const out = new Map<string, EgfrFormulaSwitch[]>()
  for (const [key, list] of byPatient) {
    const sorted = [...list].sort((a, b) => a.labDatum!.getTime() - b.labDatum!.getTime())
    const switches: EgfrFormulaSwitch[] = []
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].egfrFormula !== sorted[i - 1].egfrFormula) switches.push({ date: sorted[i].labDatum!, from: sorted[i - 1].egfrFormula!, to: sorted[i].egfrFormula! })
    }
    if (switches.length) out.set(key, switches)
  }
  return out
}

/** The formula changes a fitted slope spans: those whose first value with the
 * new equation lies after the first fitted date and on or before the last
 * (issue #66). Empty without fitted dates. */
export function fitCrossesFormulaSwitch(switches: readonly EgfrFormulaSwitch[] | undefined, firstFitted: Date | null, lastFitted: Date | null): EgfrFormulaSwitch[] {
  if (!switches || !firstFitted || !lastFitted) return []
  return switches.filter(s => s.date.getTime() > firstFitted.getTime() && s.date.getTime() <= lastFitted.getTime())
}


/** Why a patient has no creatinine series for the eGFR (decided 2026-11-21,
 * issue #65):
 * - `no_source`: no row in the selected source and no µmol/l fallback (the
 *   patient has no eligible µmol/l series, or the selected source is itself in
 *   µmol/l);
 * - `other_mgdl`: no row in the selected mg/dl source, but serum creatinine in
 *   mg/dl under another name, so no µmol/l fallback applies (OD-36);
 * - `several_umoll`: no serum creatinine in mg/dl and several eligible µmol/l
 *   series, none of them under the selected source's name (OD-36). */
export type PatientSourceGap = 'no_source' | 'other_mgdl' | 'several_umoll'

export interface PatientCreatinineSource {
  /** The one series this patient's eGFR is computed from; null when none. */
  source: Source | null
  /** True when `source` is the patient's µmol/l fallback, not the selected pair. */
  fallback: boolean
  gap: PatientSourceGap | null
  /** The patient's other eligible serum-creatinine pairs, mg/dl first, then by name. */
  others: Source[]
}

const sameSource = (a: Source, b: Source) => a[0] === b[0] && a[1] === b[1]

/** The creatinine series of every patient with at least one imported row of
 * an eligible serum-creatinine pair, keyed by `patientIdKey` (decided
 * 2026-11-21, issue #65). `selected` is the setting's pair, the mg/dl
 * preference: a patient with a row in it uses it. When `selected` is in mg/dl,
 * a patient without any eligible serum creatinine in mg/dl uses their µmol/l
 * series instead: the one under the selected pair's name, else the only one;
 * with several and none under that name, none (`several_umoll`). One series
 * per patient; series are never merged. An ineligible `selected` pair gives
 * no patient a source. */
export function patientCreatinineSources(rows: readonly LabRow[], selected: Source): Map<string, PatientCreatinineSource> {
  const byPatient = new Map<string, Map<string, Source>>()
  for (const r of rows) {
    if (r.bezeichnung == null || r.einheit == null || r.sourceSeries) continue
    if (!isSerumCreatinineSeries(r.bezeichnung, r.einheit)) continue
    const key = patientIdKey(r.patientId)
    const pairs = byPatient.get(key) ?? new Map<string, Source>()
    byPatient.set(key, pairs)
    pairs.set(`${r.bezeichnung}|${r.einheit}`, [r.bezeichnung, r.einheit])
  }
  const eligible = isSerumCreatinineSource(selected)
  const selectedMgdl = normaliseUnit(selected[1]) === 'mg/dl'
  const out = new Map<string, PatientCreatinineSource>()
  for (const [key, pairMap] of byPatient) {
    const pairs = [...pairMap.values()].sort(bySourceOrder)
    const result = (source: Source | null, fallback: boolean, gap: PatientSourceGap | null): PatientCreatinineSource =>
      ({ source, fallback, gap, others: pairs.filter((p) => !source || !sameSource(p, source)) })
    if (!eligible) { out.set(key, result(null, false, 'no_source')); continue }
    if (pairs.some((p) => sameSource(p, selected))) { out.set(key, result(selected, false, null)); continue }
    if (!selectedMgdl) { out.set(key, result(null, false, 'no_source')); continue }
    if (pairs.some((p) => normaliseUnit(p[1]) === 'mg/dl')) { out.set(key, result(null, false, 'other_mgdl')); continue }
    const umoll = pairs.filter((p) => normaliseUnit(p[1]) === 'µmol/l')
    const chosen = umoll.find((p) => p[0] === selected[0]) ?? (umoll.length === 1 ? umoll[0] : null)
    if (chosen) out.set(key, result(chosen, true, null))
    else out.set(key, result(null, false, umoll.length > 1 ? 'several_umoll' : 'no_source'))
  }
  return out
}

/** Append synthesised eGFR rows. Returns the SAME array reference unchanged when
 * no demographics, no source, source matches no rows, or nothing computes.
 * Each patient's rows come from that patient's one series
 * (`patientCreatinineSources`), recorded in `sourceSeries`. Started as a port
 * of append_computed_egfr + compute_egfr_series, which read one source for
 * the whole dataset (changed 2026-11-21, issue #65). */
export function appendComputedEgfr(rows: LabRow[], opts: EgfrOptions = {}): LabRow[] {
  const formula = opts.formula ?? 'ckd-epi-2021'
  const anySex = rows.some((r) => r.patientSex !== null)
  const anyAge = rows.some((r) => r.patientAgeAtLab !== null)
  if (!anySex && !anyAge) return rows

  let source = opts.source ?? null
  if (source == null) source = defaultCreatinineSource(creatinineSourceOptions(rows))
  if (source == null) return rows
  if (!isSerumCreatinineSource(source)) return rows
  const perPatient = patientCreatinineSources(rows, source)
  const rule: EgfrRule = { formula, paediatric: opts.paediatric ?? DEFAULT_PAEDIATRIC_RULE }
  const heights = patientHeights(rows)

  const newBez = computedEgfrName(formula)

  const computed: LabRow[] = []
  for (const r of rows) {
    const own = perPatient.get(patientIdKey(r.patientId))?.source
    if (!own || r.bezeichnung !== own[0] || r.einheit !== own[1]) continue
    const [bez, einheit] = own
    if (r.labDatum === null) continue
    if (r.wertNum === null) continue
    const scr = normaliseUnit(einheit) === 'µmol/l' ? r.wertNum / MGDL_PER_UMOLL : r.wertNum
    // Sex is required by every equation of this tool, bedside Schwartz included.
    const sex = normaliseSex(r.patientSex)
    if (sex === null || !(scr > 0)) continue
    const chosen = rowEgfrFormula(r.patientAgeAtLab, r.labDatum, rule, heights.get(patientIdKey(r.patientId)))
    if ('gap' in chosen) continue
    const egfr = ROW_FORMULA_FN[chosen.formula]({ scrMgdl: scr, ageYears: r.patientAgeAtLab!, sex, heightCm: chosen.heightCm ?? Number.NaN })
    if (Number.isNaN(egfr)) continue
    const rounded = Math.round(egfr * 10) / 10
    computed.push({
      patientId: r.patientId,
      labDatum: r.labDatum,
      bezeichnung: newBez,
      einheit: COMPUTED_EGFR_UNIT,
      wert: rounded.toFixed(1).replace('.', ','),
      wertNum: rounded,
      // A bound flips; a range or unparseable source stays non-exact, so the
      // derived value is shown but enters no fit or endpoint.
      wertOperator: OP_FLIP[r.wertOperator] ?? r.wertOperator,
      loinc: null,
      patientSex: r.patientSex,
      patientAgeAtLab: r.patientAgeAtLab,
      sourceSeries: { bezeichnung: bez, einheit },
      egfrFormula: chosen.formula,
      ...(chosen.heightCm === undefined ? {} : { egfrHeightCm: chosen.heightCm }),
    })
  }
  if (computed.length === 0) return rows
  return [...rows, ...computed]
}

/** Exact computed eGFR values above IMPLAUSIBLE_EGFR_ABOVE. The Data page warns
 * about their number before the calculation is applied; values are unchanged. */
export function implausiblyHighEgfrCount(rows: readonly LabRow[]): number {
  return rows.filter((r) => r.sourceSeries && r.wertNum !== null && isExactMeasurement(r) && r.wertNum > IMPLAUSIBLE_EGFR_ABOVE).length
}
