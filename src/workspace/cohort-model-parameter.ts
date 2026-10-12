import { mentionsEgfr } from '../core/domains/nephrology/analytes'
import { isExactMeasurement } from '../core/measurements/censored'
import { MIN_QUALIFYING_PATIENTS } from '../core/mixedModel/validation'
import type { LabRow } from '../core/types'

/** Distinct measurement times a patient needs under the default random intercept
 * and slope; mirrors the floor in validateMixedModelRows. */
const DEFAULT_MIN_DISTINCT_TIMES = 3

type ParameterRef = { key: string; bezeichnung: string; einheit: string | null }

const seriesKey = (bezeichnung: string | null, einheit: string | null) => JSON.stringify([bezeichnung, einheit])

/** Per parameter, the patients with at least three distinct dates of exact numeric
 * measurements, in one pass over the rows. A necessary condition for the default
 * model: windows and time balancing only remove rows, they never add any. */
function modelablePatientCounts(rows: readonly LabRow[], patientIds: ReadonlySet<string>): Map<string, number> {
  const times = new Map<string, Map<string, Set<number>>>()
  for (const row of rows) {
    if (row.wertNum === null || !Number.isFinite(row.wertNum) || !isExactMeasurement(row)) continue
    if (!row.labDatum || !Number.isFinite(row.labDatum.getTime())) continue
    const id = String(row.patientId)
    if (!patientIds.has(id)) continue
    const key = seriesKey(row.bezeichnung, row.einheit)
    const byPatient = times.get(key) ?? new Map<string, Set<number>>()
    const dates = byPatient.get(id) ?? new Set<number>()
    dates.add(row.labDatum.getTime())
    byPatient.set(id, dates)
    times.set(key, byPatient)
  }
  const counts = new Map<string, number>()
  for (const [key, byPatient] of times) {
    let count = 0
    for (const dates of byPatient.values()) if (dates.size >= DEFAULT_MIN_DISTINCT_TIMES) count += 1
    counts.set(key, count)
  }
  return counts
}

export function modelablePatientCount(rows: readonly LabRow[], parameter: ParameterRef, patientIds: ReadonlySet<string>): number {
  return modelablePatientCounts(rows, patientIds).get(seriesKey(parameter.bezeichnung, parameter.einheit)) ?? 0
}

/** Preselected Cohort models parameter. Candidates are ordered eGFR first, then by
 * modelable patients, then import order; the first that reaches the model minimum
 * and passes `canFit` (the real preparation and validation, checked lazily in that
 * order) wins. When none does, the first candidate is returned, so an eGFR leads and
 * the unavailability reason names it. */
export function defaultModelParameterKey(
  parameters: readonly ParameterRef[],
  rows: readonly LabRow[],
  patientIds: ReadonlySet<string>,
  canFit: (key: string) => boolean = () => true,
): string {
  const counts = modelablePatientCounts(rows, patientIds)
  const ordered = parameters.map((parameter, index) => ({
    key: parameter.key,
    egfr: mentionsEgfr(parameter.bezeichnung),
    patients: counts.get(seriesKey(parameter.bezeichnung, parameter.einheit)) ?? 0,
    index,
  })).sort((a, b) => Number(b.egfr) - Number(a.egfr) || b.patients - a.patients || a.index - b.index)
  const fittable = ordered.find(candidate => candidate.patients >= MIN_QUALIFYING_PATIENTS && canFit(candidate.key))
  return (fittable ?? ordered[0])?.key ?? ''
}
