import { patientIdKey, type LabRow, type PatientId } from '../types'
import { parseAttributeDate } from './resolve'
import { resolveBirthAnchor } from './resolveAge'

const validDate = (date: Date | null | undefined): date is Date => date != null && Number.isFinite(date.getTime())

export interface PatientBirthAnchor {
  birthAnchor: Date | null
  /** True when the anchor comes from a manual age or is inferred from ages at
   * lab dates (known in whole years only); false for a birth date read from
   * the attributes table or a dated lab row. */
  ageEstimated: boolean
}

/** One patient's birth anchor from the imported rows, the attributes-table
 * birth date and a manual age (precedence in resolveBirthAnchor). */
export function patientBirthAnchor(input: {
  patientId: PatientId
  rows: readonly LabRow[]
  attributeBirthDate: string | undefined
  manualAge: number | undefined
}): PatientBirthAnchor {
  const attributeDate = parseAttributeDate(input.attributeBirthDate)
  const { birthAnchor } = resolveBirthAnchor({ patientId: input.patientId, attributeBirthDate: attributeDate, manualAge: input.manualAge,
    rows: input.rows.map((r) => ({ labDatum: r.labDatum, ageAtLab: r.patientAgeAtLab, birthDate: r.patientBirthDate })) })
  const explicitDateAvailable = validDate(attributeDate) || input.rows.some((r) => validDate(r.labDatum) && validDate(r.patientBirthDate))
  return { birthAnchor, ageEstimated: input.manualAge !== undefined || (birthAnchor !== null && !explicitDateAvailable) }
}

/** Exact birth dates by patientIdKey (`exactBirthDateByPatient` of
 * cohortSeriesSpec): the anchors that are not estimated. Endpoint projections
 * use exact ages for these patients and completed years for the others. */
export function exactBirthDateByPatient(
  patients: Iterable<{ id: PatientId; birthAnchor?: Date | null; ageEstimated?: boolean }>,
): Record<string, Date> {
  const out: Record<string, Date> = Object.create(null)
  for (const patient of patients) if (patient.birthAnchor && patient.ageEstimated === false) out[patientIdKey(patient.id)] = patient.birthAnchor
  return out
}
