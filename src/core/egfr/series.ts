import type { LabRow, WertOperator } from '../types'
import { ckdEpi2021, ekfc2021, mdrd4, normaliseSex, type EgfrInput } from './formulas'

export const COMPUTED_BEZEICHNUNG_SUFFIX = ', computed)'
export const MGDL_PER_UMOLL = 88.42

export type FormulaName = 'ckd-epi-2021' | 'mdrd-4' | 'ekfc-2021'

const FORMULA_FN: Record<FormulaName, (i: EgfrInput) => number> = {
  'ckd-epi-2021': ckdEpi2021,
  'mdrd-4': mdrd4,
  'ekfc-2021': ekfc2021,
}
const FORMULA_BEZ: Record<FormulaName, string> = {
  'ckd-epi-2021': `eGFR (CKD-EPI 2021${COMPUTED_BEZEICHNUNG_SUFFIX}`,
  'mdrd-4': `eGFR (MDRD-4${COMPUTED_BEZEICHNUNG_SUFFIX}`,
  'ekfc-2021': `eGFR (EKFC 2021${COMPUTED_BEZEICHNUNG_SUFFIX}`,
}
const OP_FLIP: Record<string, WertOperator> = { '<': '>', '>': '<', '=': '=' }
const SERUM_UNITS = ['mg/dl', 'µmol/l'] as const

export function normaliseUnit(einheit: string | null): string {
  if (einheit == null) return ''
  const s = einheit.replace(/ /g, ' ').trim().toLowerCase().replace(/μ/g, 'µ')
  if (s === 'mg/dl') return 'mg/dl'
  if (s === 'µmol/l' || s === 'umol/l') return 'µmol/l'
  return s
}

function isCreatinineName(bez: string | null): boolean {
  if (bez == null) return false
  const s = bez.replace(/ /g, ' ').trim().toLowerCase()
  return s.includes('kreatinin') || s.includes('creatinin')
}

function isUrineName(bez: string | null): boolean {
  if (bez == null) return false
  const s = bez.replace(/ /g, ' ').trim()
  const low = s.toLowerCase()
  if (low.includes('urin') || low.includes('harn') || low.includes('urine')) return true
  return s.endsWith('UR')
}

export type Source = [string, string]

/** Distinct serum-creatinine (Bezeichnung, Einheit) pairs eligible as an eGFR
 * source, mg/dl-first then by name. Mirrors creatinine_source_options. */
export function creatinineSourceOptions(rows: LabRow[]): Source[] {
  const seen = new Map<string, Source>()
  for (const r of rows) {
    if (r.bezeichnung == null || r.einheit == null) continue
    const key = `${r.bezeichnung}|${r.einheit}`
    if (seen.has(key)) continue
    if (isCreatinineName(r.bezeichnung) && !isUrineName(r.bezeichnung) && (SERUM_UNITS as readonly string[]).includes(normaliseUnit(r.einheit))) {
      seen.set(key, [r.bezeichnung, r.einheit])
    }
  }
  return [...seen.values()].sort(
    (a, b) => Number(normaliseUnit(a[1]) !== 'mg/dl') - Number(normaliseUnit(b[1]) !== 'mg/dl') || a[0].toLowerCase().localeCompare(b[0].toLowerCase()),
  )
}

export function allSourceOptions(rows: LabRow[]): Source[] {
  const seen = new Map<string, Source>()
  for (const r of rows) {
    if (r.bezeichnung == null || r.einheit == null) continue
    const key = `${r.bezeichnung}|${r.einheit}`
    if (!seen.has(key)) seen.set(key, [r.bezeichnung, r.einheit])
  }
  return [...seen.values()].sort(
    (a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()) || normaliseUnit(a[1]).localeCompare(normaliseUnit(b[1])),
  )
}

export function isSerumCreatinineSource(source: Source): boolean {
  const [bez, einheit] = source
  return isCreatinineName(bez) && !isUrineName(bez) && (SERUM_UNITS as readonly string[]).includes(normaliseUnit(einheit))
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

/** Append synthesised eGFR rows. Returns the SAME array reference unchanged when
 * no demographics, no source, source matches no rows, or nothing computes.
 * Mirrors append_computed_egfr + compute_egfr_series. */
export function appendComputedEgfr(rows: LabRow[], opts: EgfrOptions = {}): LabRow[] {
  const formula = opts.formula ?? 'ckd-epi-2021'
  const anySex = rows.some((r) => r.patientSex !== null)
  const anyAge = rows.some((r) => r.patientAgeAtLab !== null)
  if (!anySex && !anyAge) return rows

  let source = opts.source ?? null
  if (source == null) source = defaultCreatinineSource(creatinineSourceOptions(rows))
  if (source == null) return rows
  if (!isSerumCreatinineSource(source)) return rows
  const [bez, einheit] = source

  const fn = FORMULA_FN[formula]
  const newBez = FORMULA_BEZ[formula]
  const toMgdl = normaliseUnit(einheit) === 'µmol/l'

  const computed: LabRow[] = []
  for (const r of rows) {
    if (r.bezeichnung !== bez || r.einheit !== einheit) continue
    if (r.labDatum === null) continue
    if (r.wertNum === null) continue
    const scr = toMgdl ? r.wertNum / MGDL_PER_UMOLL : r.wertNum
    const egfr = fn({ scrMgdl: scr, ageYears: r.patientAgeAtLab ?? Number.NaN, sex: normaliseSex(r.patientSex) })
    if (Number.isNaN(egfr)) continue
    const rounded = Math.round(egfr * 10) / 10
    computed.push({
      patientId: r.patientId,
      labDatum: r.labDatum,
      bezeichnung: newBez,
      einheit: 'ml/min/1,73m²',
      wert: rounded.toFixed(1).replace('.', ','),
      wertNum: rounded,
      wertOperator: OP_FLIP[r.wertOperator] ?? '=',
      loinc: null,
      patientSex: r.patientSex,
      patientAgeAtLab: r.patientAgeAtLab,
    })
  }
  if (computed.length === 0) return rows
  return [...rows, ...computed]
}
