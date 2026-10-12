import { mentionsEgfr } from '../core/domains/nephrology/analytes'
import { MIN_QUALIFYING_PATIENTS } from '../core/mixedModel/validation'
import type { LabRow } from '../core/types'

/** Distinct measurement times a patient needs under the default random intercept
 * and slope; mirrors the floor in validateMixedModelRows. */
const DEFAULT_MIN_DISTINCT_TIMES = 3

type ParameterRef = { key: string; bezeichnung: string; einheit: string | null }

/** Patients with enough distinct dated numeric measurements of this parameter for
 * the default model. A cheap pre-check on the imported and computed rows, before
 * Trajectories exclusions; validateMixedModelRows stays the binding gate. */
export function modelablePatientCount(rows: readonly LabRow[], parameter: ParameterRef, patientIds: ReadonlySet<string>): number {
  const times = new Map<string, Set<number>>()
  for (const row of rows) {
    if (row.bezeichnung !== parameter.bezeichnung || row.einheit !== parameter.einheit) continue
    if (row.wertNum === null || !Number.isFinite(row.wertNum) || !row.labDatum || !Number.isFinite(row.labDatum.getTime())) continue
    const id = String(row.patientId)
    if (!patientIds.has(id)) continue
    const set = times.get(id) ?? new Set<number>()
    set.add(row.labDatum.getTime())
    times.set(id, set)
  }
  let count = 0
  for (const set of times.values()) if (set.size >= DEFAULT_MIN_DISTINCT_TIMES) count += 1
  return count
}

/** Preselected Cohort models parameter: one that can be fitted comes first, then
 * eGFR, then the most modelable patients, then the import order. When nothing can
 * be fitted, eGFR still leads so the unavailability reason names it. */
export function defaultModelParameterKey(parameters: readonly ParameterRef[], rows: readonly LabRow[], patientIds: ReadonlySet<string>): string {
  const ranked = parameters.map((parameter, index) => {
    const patients = modelablePatientCount(rows, parameter, patientIds)
    return { key: parameter.key, fittable: patients >= MIN_QUALIFYING_PATIENTS, egfr: mentionsEgfr(parameter.bezeichnung), patients, index }
  })
  ranked.sort((a, b) =>
    Number(b.fittable) - Number(a.fittable)
    || Number(b.egfr) - Number(a.egfr)
    || b.patients - a.patients
    || a.index - b.index)
  return ranked[0]?.key ?? ''
}
