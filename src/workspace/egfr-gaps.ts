import { patientIdKey, type LabRow } from '../core/types'
import { COMPUTED_EGFR_UNIT, computedEgfrName } from '../core/domains/nephrology/analytes'
import { creatinineSourceOptions, defaultCreatinineSource } from '../core/domains/nephrology/egfr/series'
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
 * is anyone while the derivation is off or has no source. */
export function missingEgfrNotes(data: Pick<WorkspaceData, 'rows' | 'rawRows' | 'patients' | 'analysisSettings'>): Map<string, MissingEgfrNote> {
  const notes = new Map<string, MissingEgfrNote>()
  const computedKey = computedEgfrKey(data)
  if (!computedKey) return notes
  const source = data.analysisSettings.egfr?.source ?? defaultCreatinineSource(creatinineSourceOptions(data.rawRows))
  if (!source) return notes
  const computed = new Set<string>()
  const reasons = new Map<string, Map<EgfrGapReason, number>>()
  // data.rows are the imported rows with resolved sex and age, followed by the computed ones.
  for (const row of data.rows) {
    const patient = patientIdKey(row.patientId)
    if (JSON.stringify([row.bezeichnung, row.einheit]) === computedKey && row.sourceSeries) { computed.add(patient); continue }
    if (row.bezeichnung !== source[0] || row.einheit !== source[1]) continue
    const counts = reasons.get(patient) ?? new Map<EgfrGapReason, number>()
    reasons.set(patient, counts)
    for (const reason of egfrGapReasons(row)) counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  for (const patient of data.patients) {
    const key = patientIdKey(patient.id)
    if (computed.has(key)) continue
    const counts = reasons.get(key)
    if (!counts) {
      notes.set(key, { label: 'No eGFR: no creatinine in the source', text: `No eGFR for this patient: no value in the creatinine source ${parameterLabel(source[0], source[1])}. Values under another name or unit are not used.` })
      continue
    }
    const found = ORDER.filter(reason => counts.has(reason))
    // Every row could be computed, yet nothing was: not a per-patient reason (for example a source that is not serum creatinine).
    if (!found.length) continue
    const demographics = found.filter(reason => reason === 'sex' || reason === 'age').map(reason => reason === 'sex' ? 'the sex' : 'the age')
    notes.set(key, {
      label: `No eGFR: ${found[0] === 'sex' && counts.has('age') ? 'sex and age missing' : SHORT[found[0]]}`,
      text: `No eGFR for this patient: ${found.map(reason => `${SHORT[reason]} (${counts.get(reason)} creatinine ${counts.get(reason) === 1 ? 'value' : 'values'})`).join('; ')}.`
        + (demographics.length ? ` Enter ${demographics.join(' and ')} under Data → “Review and edit patients”.` : ''),
    })
  }
  return notes
}
