import type { LabRow, PatientId } from '../core/types'
import { COMPUTED_BEZEICHNUNG_SUFFIX } from '../core/egfr/series'

export interface SeriesOption {
  bezeichnung: string
  einheit: string | null
}

/** Distinct (bezeichnung, einheit) pairs for a patient, sorted by name then unit. */
export function seriesOptions(rows: LabRow[], patientId: PatientId): SeriesOption[] {
  return distinctSeriesOptions(rows.filter((r) => r.patientId === patientId))
}

/** Distinct (bezeichnung, einheit) pairs across the loaded cohort. */
export function cohortSeriesOptions(rows: LabRow[]): SeriesOption[] {
  return distinctSeriesOptions(rows)
}

function distinctSeriesOptions(rows: LabRow[]): SeriesOption[] {
  const seen = new Map<string, SeriesOption>()
  for (const r of rows) {
    if (r.bezeichnung === null) continue
    const key = `${r.bezeichnung}|${r.einheit ?? ''}`
    if (!seen.has(key)) seen.set(key, { bezeichnung: r.bezeichnung, einheit: r.einheit })
  }
  return [...seen.values()].sort(
    (a, b) => a.bezeichnung.localeCompare(b.bezeichnung) || (a.einheit ?? '').localeCompare(b.einheit ?? ''),
  )
}

export function seriesDisplayLabel(opt: SeriesOption): string {
  const computed = opt.bezeichnung.includes(COMPUTED_BEZEICHNUNG_SUFFIX)
  const base = opt.einheit ? `${opt.bezeichnung} (${opt.einheit})` : opt.bezeichnung
  return computed ? `ƒ ${base}` : base
}

/** Patient identifier label. Names are intentionally not stored or displayed
 * (no PHI names enter the app), so this is just the patient id. */
export function patientLabel(_rows: LabRow[], patientId: PatientId): string {
  return String(patientId)
}
