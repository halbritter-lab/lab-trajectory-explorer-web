import { patientIdKey, type LabRow } from '../core/types'
import { COMPUTED_EGFR_UNIT, computedEgfrName, normaliseUnit } from '../core/domains/nephrology/analytes'
import { creatinineSourceOptions, defaultCreatinineSource, isSerumCreatinineSource, patientCreatinineSources, type Source } from '../core/domains/nephrology/egfr/series'
import { parameterLabel } from './workspace-labels'
import type { WorkspaceData } from './workspace-data'

/** Why no eGFR is computed from one row of the creatinine source, in the order
 * the reasons are checked. One rule for the counts on the Data page (first
 * reason per row) and for the note in a patient's empty eGFR cell (every
 * reason per row, so the note names all that has to be supplied). */
export type EgfrGapReason = 'date' | 'value' | 'non_positive' | 'sex' | 'age' | 'under_18'

type GapRow = Pick<LabRow, 'labDatum' | 'wertNum' | 'patientSex' | 'patientAgeAtLab'>

/** Every condition a source row (with resolved sex and age) fails, in the
 * order they are checked: date, value, sex and age are independent, so a row
 * without sex and age reports both. Empty when the row gives an eGFR. */
export function egfrGapReasons(row: GapRow): EgfrGapReason[] {
  const reasons: EgfrGapReason[] = []
  if (!row.labDatum) reasons.push('date')
  if (row.wertNum === null) reasons.push('value')
  else if (!(row.wertNum > 0)) reasons.push('non_positive')
  if (!row.patientSex) reasons.push('sex')
  if (row.patientAgeAtLab === null) reasons.push('age')
  else if (row.patientAgeAtLab < 18) reasons.push('under_18')
  return reasons
}

/** The first reason that keeps a source row from giving an eGFR; null when
 * nothing does. The Data page counts every row once, under this reason. */
export function egfrGapReason(row: GapRow): EgfrGapReason | null {
  return egfrGapReasons(row)[0] ?? null
}

/** Wording of the counts on the Data page. */
export const EGFR_GAP_TEXT: Record<EgfrGapReason, string> = {
  date: 'Date missing',
  value: 'Numeric value missing',
  non_positive: 'Creatinine must be positive',
  sex: 'Sex missing or unresolved',
  age: 'Age missing',
  under_18: 'Age under 18 — adult eGFR formulas do not apply',
}
const SHORT: Record<EgfrGapReason, string> = {
  date: 'date missing', value: 'numeric value missing', non_positive: 'creatinine not positive',
  sex: 'sex missing', age: 'age missing', under_18: 'age under 18',
}
const ORDER = Object.keys(EGFR_GAP_TEXT) as EgfrGapReason[]

export interface MissingEgfrNote {
  /** Short form for the cell: the first reason, e.g. "No eGFR: sex missing",
   * or "No eGFR: sex and age missing" when both have to be entered. */
  label: string
  /** The sentence for the hint and the patient view. */
  text: string
}

/** The parameter key of the computed eGFR, or null while the derivation is off. */
export function computedEgfrKey(data: Pick<WorkspaceData, 'analysisSettings'>): string | null {
  const formula = data.analysisSettings.egfr?.formula
  return formula && formula !== 'off' ? JSON.stringify([computedEgfrName(formula), COMPUTED_EGFR_UNIT]) : null
}

/** For every patient without a single computed eGFR value: why. Keyed by
 * patientIdKey. Patients with at least one computed value are not listed, nor
 * is anyone while the derivation is off, has no source or reads a source that
 * is not serum creatinine (the Data page says so). The reasons are counted on
 * the rows of the patient's own creatinine series (`patientCreatinineSources`:
 * the selected source, or the patient's µmol/l fallback). */
export function missingEgfrNotes(data: Pick<WorkspaceData, 'rows' | 'rawRows' | 'patients' | 'analysisSettings'>): Map<string, MissingEgfrNote> {
  const notes = new Map<string, MissingEgfrNote>()
  const computedKey = computedEgfrKey(data)
  if (!computedKey) return notes
  const source = data.analysisSettings.egfr?.source ?? defaultCreatinineSource(creatinineSourceOptions(data.rawRows))
  if (!source || !isSerumCreatinineSource(source)) return notes
  // data.rows are the imported rows with resolved sex and age, followed by the computed ones.
  const perPatient = patientCreatinineSources(data.rows, source)
  const computed = new Set<string>()
  const reasons = new Map<string, Map<EgfrGapReason, number>>()
  for (const row of data.rows) {
    const patient = patientIdKey(row.patientId)
    if (JSON.stringify([row.bezeichnung, row.einheit]) === computedKey && row.sourceSeries) { computed.add(patient); continue }
    const own = perPatient.get(patient)?.source
    if (!own || row.bezeichnung !== own[0] || row.einheit !== own[1]) continue
    const counts = reasons.get(patient) ?? new Map<EgfrGapReason, number>()
    reasons.set(patient, counts)
    for (const reason of egfrGapReasons(row)) counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  const labels = (pairs: readonly Source[]) => pairs.map(([name, unit]) => parameterLabel(name, unit)).join(', ')
  const selected = parameterLabel(source[0], source[1])
  for (const patient of data.patients) {
    const key = patientIdKey(patient.id)
    if (computed.has(key)) continue
    const resolved = perPatient.get(key)
    if (!resolved) {
      notes.set(key, { label: 'No eGFR: no serum creatinine', text: 'No eGFR for this patient: no serum creatinine value in mg/dl or µmol/l.' })
      continue
    }
    if (resolved.gap === 'other_mgdl') {
      notes.set(key, { label: 'No eGFR: creatinine under another name', text: `No eGFR for this patient: no value in the creatinine source ${selected}. Serum creatinine in mg/dl under another name (${labels(resolved.others.filter(([, unit]) => normaliseUnit(unit) === 'mg/dl'))}) is not used, and µmol/l values are used only for patients without any serum creatinine in mg/dl.` })
      continue
    }
    if (resolved.gap === 'several_umoll') {
      notes.set(key, { label: 'No eGFR: several µmol/l series', text: `No eGFR for this patient: no serum creatinine in mg/dl and several series in µmol/l (${labels(resolved.others)}), none under the name of the creatinine source ${selected}. Series are not merged, so none is used.` })
      continue
    }
    if (resolved.gap === 'no_source') {
      notes.set(key, { label: 'No eGFR: no creatinine in the source', text: `No eGFR for this patient: no value in the creatinine source ${selected}. ${labels(resolved.others)} ${resolved.others.length === 1 ? 'is' : 'are'} not used: only a source in mg/dl falls back to a patient's µmol/l series.` })
      continue
    }
    const counts = reasons.get(key)
    if (!counts) continue
    const found = ORDER.filter(reason => counts.has(reason))
    // Every row could be computed, yet nothing was: not a per-patient reason.
    if (!found.length) continue
    const demographics = found.filter(reason => reason === 'sex' || reason === 'age').map(reason => reason === 'sex' ? 'the sex' : 'the age')
    const own = resolved.source!
    notes.set(key, {
      label: `No eGFR: ${found[0] === 'sex' && counts.has('age') ? 'sex and age missing' : SHORT[found[0]]}`,
      text: `No eGFR for this patient: ${found.map(reason => `${SHORT[reason]} (${counts.get(reason)} creatinine ${counts.get(reason) === 1 ? 'value' : 'values'})`).join('; ')}.`
        + (demographics.length ? ` Enter ${demographics.join(' and ')} under Data → “Review and edit patients”.` : '')
        + (resolved.fallback ? ` Creatinine source of this patient: ${parameterLabel(own[0], own[1])}, because the patient has no serum creatinine in mg/dl.` : ''),
    })
  }
  return notes
}
