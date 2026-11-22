import { patientIdKey, type LabRow, type WertOperator } from '../../../types'
import { ckdEpi2009, ckdEpi2021, ekfc2021, mdrd4, normaliseSex, type EgfrInput } from './formulas'
import { IMPLAUSIBLE_EGFR_ABOVE, MGDL_PER_UMOLL } from '../constants'
import { isExactMeasurement } from '../../../measurements/censored'
import {
  COMPUTED_EGFR_UNIT,
  computedEgfrName,
  isSerumCreatinineSeries,
  normaliseUnit,
  type FormulaName,
} from '../analytes'

export { COMPUTED_BEZEICHNUNG_SUFFIX, normaliseUnit, type FormulaName } from '../analytes'
export { MGDL_PER_UMOLL } from '../constants'

const FORMULA_FN: Record<FormulaName, (i: EgfrInput) => number> = {
  'ckd-epi-2021': ckdEpi2021,
  'ckd-epi-2009': ckdEpi2009,
  'mdrd-4': mdrd4,
  'ekfc-2021': ekfc2021,
}
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

  const fn = FORMULA_FN[formula]
  const newBez = computedEgfrName(formula)

  const computed: LabRow[] = []
  for (const r of rows) {
    const own = perPatient.get(patientIdKey(r.patientId))?.source
    if (!own || r.bezeichnung !== own[0] || r.einheit !== own[1]) continue
    const [bez, einheit] = own
    if (r.labDatum === null) continue
    if (r.wertNum === null) continue
    const scr = normaliseUnit(einheit) === 'µmol/l' ? r.wertNum / MGDL_PER_UMOLL : r.wertNum
    const egfr = fn({ scrMgdl: scr, ageYears: r.patientAgeAtLab ?? Number.NaN, sex: normaliseSex(r.patientSex) })
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
